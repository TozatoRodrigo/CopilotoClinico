import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiRefusalError, AiTruncatedError } from '../../ai-gateway/ai-gateway.errors';
import type { ChatMessage, CompletionUsage } from '../../ai-gateway/providers/provider.interface';
import type { CaseUnderstanding } from '../../../shared/contracts/clinical';
import { calculateInferenceCost } from '../orchestrator/model-pricing';
import { CASE_UNDERSTANDING_JSON_SCHEMA } from './case-understanding.json-schema';
import { validateUnderstanding } from './case-understanding.schema';
import {
  buildUnderstandingMessages,
  understandingRetryFeedback,
  type UnderstandingPromptInput,
} from './understanding-prompt';
import { readUnderstandingEffort, readUnderstandingModel } from './understanding.settings';

export interface UnderstandingRequest extends UnderstandingPromptInput {
  /** Sufixo dos logs, o mesmo do orquestrador: '', ' (stream)' ou ' (respond)'. */
  logLabel: string;
}

/**
 * Resultado da Etapa 1. `understanding: null` quer dizer que a etapa falhou e
 * a análise segue pelo caminho de sempre; custo, tokens e tempo contam do
 * mesmo jeito, porque as chamadas foram feitas.
 */
export interface UnderstandingOutcome {
  understanding: CaseUnderstanding | null;
  /** Modelo que respondeu por último; `null` quando nenhuma chamada respondeu. */
  model: string | null;
  /** Soma das chamadas (tentativa + retry); `null` sem resposta do provider. */
  usage: CompletionUsage | null;
  cost: number;
  latencyMs: number;
}

type AttemptResult =
  | { kind: 'valid'; understanding: CaseUnderstanding; content: string }
  | { kind: 'invalid'; errors: string[]; content: string }
  | { kind: 'failed'; reason: string };

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
    const startedAt = Date.now();
    const outcome: UnderstandingOutcome = {
      understanding: null,
      model: null,
      usage: null,
      cost: 0,
      latencyMs: 0,
    };
    const messages = buildUnderstandingMessages(request);

    const first = await this.attempt(messages, outcome);
    const settled =
      first.kind === 'invalid'
        ? await this.retry(messages, first, outcome, request.logLabel)
        : first;

    outcome.latencyMs = Date.now() - startedAt;
    if (settled.kind === 'valid') {
      outcome.understanding = settled.understanding;
      this.logger.log(
        `UNDERSTANDING${request.logLabel} model=${outcome.model} latencyMs=${outcome.latencyMs} ` +
          `syndrome=${settled.understanding.syndrome} instability=${settled.understanding.instability.present} ` +
          `cannotMiss=${settled.understanding.cannotMiss.length} queries=${settled.understanding.searchQueries.length}`,
      );
      return outcome;
    }

    const reason = settled.kind === 'invalid' ? settled.errors.join(' | ') : settled.reason;
    this.logger.warn(
      `UNDERSTANDING_FAILED${request.logLabel} model=${outcome.model ?? '-'} ` +
        `latencyMs=${outcome.latencyMs}: ${reason}`,
    );
    return outcome;
  }

  private async retry(
    messages: ChatMessage[],
    invalid: Extract<AttemptResult, { kind: 'invalid' }>,
    outcome: UnderstandingOutcome,
    logLabel: string,
  ): Promise<AttemptResult> {
    this.logger.warn(`UNDERSTANDING_RETRY${logLabel}: ${invalid.errors.join(' | ')}`);
    // Resposta vazia não entra como turno do assistente: a API a rejeita.
    return this.attempt(
      [
        ...messages,
        ...(invalid.content ? [{ role: 'assistant' as const, content: invalid.content }] : []),
        { role: 'user', content: understandingRetryFeedback(invalid.errors) },
      ],
      outcome,
    );
  }

  /** Uma chamada ao modelo; acumula modelo, tokens e custo em `outcome`. */
  private async attempt(
    messages: ChatMessage[],
    outcome: UnderstandingOutcome,
  ): Promise<AttemptResult> {
    try {
      const completion = await this.aiGateway.complete({
        messages,
        model: readUnderstandingModel(this.config),
        effort: readUnderstandingEffort(this.config),
        responseSchema: CASE_UNDERSTANDING_JSON_SCHEMA,
      });
      this.account(outcome, completion.model, completion.usage);
      const validation = validateUnderstanding(completion.content);
      return validation.valid
        ? { kind: 'valid', understanding: validation.understanding, content: completion.content }
        : { kind: 'invalid', errors: validation.errors, content: completion.content };
    } catch (error) {
      if (error instanceof AiTruncatedError || error instanceof AiRefusalError) {
        this.account(outcome, error.details.model, error.details.usage);
        return { kind: 'failed', reason: error.message };
      }
      // Erro de provider ou de rede: a Etapa 1 é opcional, a análise segue
      // pela busca de sempre. Fica no log como erro para não sumir.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`UNDERSTANDING_PROVIDER_ERROR: ${message}`);
      return { kind: 'failed', reason: message };
    }
  }

  private account(outcome: UnderstandingOutcome, model: string, usage: CompletionUsage): void {
    outcome.model = model;
    outcome.usage = addUsage(outcome.usage, usage);
    outcome.cost += calculateInferenceCost({ model, usage });
  }
}
