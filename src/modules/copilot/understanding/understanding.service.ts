import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiRefusalError, AiTruncatedError } from '../../ai-gateway/ai-gateway.errors';
import type {
  ChatMessage,
  CompletionUsage,
  JsonResponseSchema,
} from '../../ai-gateway/providers/provider.interface';
import type { CaseUnderstanding } from '../../../shared/contracts/clinical';
import { calculateInferenceCost } from '../orchestrator/model-pricing';
import { CASE_UNDERSTANDING_JSON_SCHEMA } from './case-understanding.json-schema';
import {
  CaseUnderstandingSchema,
  validateStructured,
  type StructuredValidation,
} from './case-understanding.schema';
import {
  buildUnderstandingMessages,
  understandingRetryFeedback,
  type UnderstandingPromptInput,
} from './understanding-prompt';
import {
  readIntakeReadingModel,
  readUnderstandingEffort,
  readUnderstandingModel,
} from './understanding.settings';
import { buildIntakeReadingMessages } from '../intake/intake-reading-prompt';
import { INTAKE_READING_JSON_SCHEMA } from '../intake/intake-reading.json-schema';
import { IntakeReadingSchema, type IntakeReading } from '../intake/intake-reading.schema';

export interface UnderstandingRequest extends UnderstandingPromptInput {
  /** Sufixo dos logs, o mesmo do orquestrador: '', ' (stream)' ou ' (respond)'. */
  logLabel: string;
}

/**
 * Resultado de uma chamada estruturada da Etapa 1 (entendimento ou leitura do
 * caso). `value: null` quer dizer que a etapa falhou e a análise segue pelo
 * caminho de sempre; custo, tokens e tempo contam do mesmo jeito, porque as
 * chamadas foram feitas.
 */
interface StageOutcome<Value> {
  value: Value | null;
  /** Modelo que respondeu por último; `null` quando nenhuma chamada respondeu. */
  model: string | null;
  /** Soma das chamadas (tentativa + retry); `null` sem resposta do provider. */
  usage: CompletionUsage | null;
  cost: number;
  latencyMs: number;
}

export interface UnderstandingOutcome extends Omit<StageOutcome<CaseUnderstanding>, 'value'> {
  understanding: CaseUnderstanding | null;
}

/** ADR-014 — leitura do caso do Copiloto guiado: entendimento + perguntas candidatas. */
export interface IntakeReadingOutcome extends Omit<StageOutcome<IntakeReading>, 'value'> {
  reading: IntakeReading | null;
}

/** O que muda entre o entendimento e a leitura do caso; o resto (retry, custo, logs) é igual. */
interface StageSpec<Value> {
  tag: 'UNDERSTANDING' | 'INTAKE_READING';
  messages: ChatMessage[];
  model: string | undefined;
  responseSchema: JsonResponseSchema;
  validate: (rawOutput: string) => StructuredValidation<Value>;
  summarize: (value: Value) => string;
}

type AttemptResult<Value> =
  | { kind: 'valid'; value: Value; content: string }
  | { kind: 'invalid'; errors: string[]; content: string }
  | { kind: 'failed'; reason: string };

function summarizeUnderstanding(understanding: CaseUnderstanding): string {
  return (
    `syndrome=${understanding.syndrome} instability=${understanding.instability.present} ` +
    `cannotMiss=${understanding.cannotMiss.length} queries=${understanding.searchQueries.length}`
  );
}

function addUsage(total: CompletionUsage | null, usage: CompletionUsage): CompletionUsage {
  if (!total) return usage;
  return {
    promptTokens: total.promptTokens + usage.promptTokens,
    completionTokens: total.completionTokens + usage.completionTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
    cacheReadTokens: (total.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
    cacheWriteTokens: (total.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
  };
}

/**
 * F1 — Etapa 1 do raciocínio em etapas (ADR-013): uma chamada com saída
 * estruturada que produz o `CaseUnderstanding` antes de qualquer busca.
 *
 * Nunca bloqueia a análise (princípio da emenda de 10/10/2026 ao ADR-012):
 * saída inválida ganha UM retry com o feedback do validador; segunda falha,
 * truncamento, recusa ou erro do provider devolvem `understanding: null`, e o
 * orquestrador volta à busca pelo texto do caso.
 */
@Injectable()
export class UnderstandingService {
  private readonly logger = new Logger(UnderstandingService.name);

  constructor(
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async understand(request: UnderstandingRequest): Promise<UnderstandingOutcome> {
    const { value, ...outcome } = await this.run(
      {
        tag: 'UNDERSTANDING',
        messages: buildUnderstandingMessages(request),
        model: readUnderstandingModel(this.config),
        responseSchema: CASE_UNDERSTANDING_JSON_SCHEMA,
        validate: (rawOutput) => validateStructured(CaseUnderstandingSchema, rawOutput),
        summarize: summarizeUnderstanding,
      },
      request.logLabel,
    );
    return { ...outcome, understanding: value };
  }

  /**
   * ADR-014 — leitura do caso antes do plano: o entendimento da Etapa 1 mais
   * as perguntas que o médico responde em segundos. Mesma regra de nunca
   * bloquear: falha devolve `reading: null` e o caso segue direto ao plano.
   */
  async readForIntake(request: UnderstandingRequest): Promise<IntakeReadingOutcome> {
    const { value, ...outcome } = await this.run(
      {
        tag: 'INTAKE_READING',
        messages: buildIntakeReadingMessages(request),
        model: readIntakeReadingModel(this.config),
        responseSchema: INTAKE_READING_JSON_SCHEMA,
        validate: (rawOutput) => validateStructured(IntakeReadingSchema, rawOutput),
        summarize: (reading) =>
          `${summarizeUnderstanding(reading)} timeCritical=${reading.timeCritical} ` +
          `intakeQuestions=${reading.intakeQuestions.length}`,
      },
      request.logLabel,
    );
    return { ...outcome, reading: value };
  }

  private async run<Value>(spec: StageSpec<Value>, logLabel: string): Promise<StageOutcome<Value>> {
    const startedAt = Date.now();
    const outcome: StageOutcome<Value> = {
      value: null,
      model: null,
      usage: null,
      cost: 0,
      latencyMs: 0,
    };

    const first = await this.attempt(spec, spec.messages, outcome);
    const settled =
      first.kind === 'invalid' ? await this.retry(spec, first, outcome, logLabel) : first;

    outcome.latencyMs = Date.now() - startedAt;
    if (settled.kind === 'valid') {
      outcome.value = settled.value;
      this.logger.log(
        `${spec.tag}${logLabel} model=${outcome.model} latencyMs=${outcome.latencyMs} ` +
          spec.summarize(settled.value),
      );
      return outcome;
    }

    const reason = settled.kind === 'invalid' ? settled.errors.join(' | ') : settled.reason;
    this.logger.warn(
      `${spec.tag}_FAILED${logLabel} model=${outcome.model ?? '-'} ` +
        `latencyMs=${outcome.latencyMs}: ${reason}`,
    );
    return outcome;
  }

  private async retry<Value>(
    spec: StageSpec<Value>,
    invalid: Extract<AttemptResult<Value>, { kind: 'invalid' }>,
    outcome: StageOutcome<Value>,
    logLabel: string,
  ): Promise<AttemptResult<Value>> {
    this.logger.warn(`${spec.tag}_RETRY${logLabel}: ${invalid.errors.join(' | ')}`);
    // Resposta vazia não entra como turno do assistente: a API a rejeita.
    return this.attempt(
      spec,
      [
        ...spec.messages,
        ...(invalid.content ? [{ role: 'assistant' as const, content: invalid.content }] : []),
        { role: 'user', content: understandingRetryFeedback(invalid.errors) },
      ],
      outcome,
    );
  }

  /** Uma chamada ao modelo; acumula modelo, tokens e custo em `outcome`. */
  private async attempt<Value>(
    spec: StageSpec<Value>,
    messages: ChatMessage[],
    outcome: StageOutcome<Value>,
  ): Promise<AttemptResult<Value>> {
    try {
      const completion = await this.aiGateway.complete({
        messages,
        model: spec.model,
        effort: readUnderstandingEffort(this.config),
        responseSchema: spec.responseSchema,
        stage: spec.tag === 'INTAKE_READING' ? 'intake_reading' : 'understanding',
      });
      this.account(outcome, completion.model, completion.usage);
      const validation = spec.validate(completion.content);
      return validation.valid
        ? { kind: 'valid', value: validation.value, content: completion.content }
        : { kind: 'invalid', errors: validation.errors, content: completion.content };
    } catch (error) {
      if (error instanceof AiTruncatedError || error instanceof AiRefusalError) {
        this.account(outcome, error.details.model, error.details.usage);
        return { kind: 'failed', reason: error.message };
      }
      // Erro de provider ou de rede: a Etapa 1 é opcional, a análise segue
      // pela busca de sempre. Fica no log como erro para não sumir.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${spec.tag}_PROVIDER_ERROR: ${message}`);
      return { kind: 'failed', reason: message };
    }
  }

  private account<Value>(
    outcome: StageOutcome<Value>,
    model: string,
    usage: CompletionUsage,
  ): void {
    outcome.model = model;
    outcome.usage = addUsage(outcome.usage, usage);
    outcome.cost += calculateInferenceCost({ model, usage });
  }
}
