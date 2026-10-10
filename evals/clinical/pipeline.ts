import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../src/config/prisma.service';
import { AiRefusalError, AiTruncatedError } from '../../src/modules/ai-gateway/ai-gateway.errors';
import { readChoice } from '../../src/modules/ai-gateway/ai-gateway.settings';
import { claudeCapabilities } from '../../src/modules/ai-gateway/providers/claude-models';
import type {
  OrchestratorResult,
  OrchestratorService,
} from '../../src/modules/copilot/orchestrator/orchestrator.service';
import type { EncountersService } from '../../src/modules/encounters/encounters.service';
import type { ClinicalCase } from './case.schema';
import type { RunStatus } from './graders/deterministic';
import { costUsd, isSameModel } from './pricing';
import type { CompletionRecorder, RecordedCompletion } from './recorder';
import type { ErrorRow, FailureClass, ResultRow } from './records';
import { DEFAULT_RETRY_POLICY, retryWhile, withTimeout, type RetryPolicy } from './scheduling';

/**
 * F0-A — Uma execução de um caso pelo pipeline real, do jeito que o médico o
 * dispara: atendimento novo + `OrchestratorService.analyze` (turno 0).
 */

export const EVAL_PHYSICIAN_EMAIL = 'gabarito-clinico@avaliacao.local';

/**
 * Médico sintético dono de todos os atendimentos da avaliação. Sem
 * instituição: o retrieval enxerga só a base global, igual a um médico sem
 * vínculo. O hash de senha não é bcrypt válido — a conta não faz login.
 */
export async function ensureEvalPhysician(prisma: PrismaService): Promise<string> {
  const physician = await prisma.physician.upsert({
    where: { email: EVAL_PHYSICIAN_EMAIL },
    update: {},
    create: {
      email: EVAL_PHYSICIAN_EMAIL,
      name: 'Avaliação automática (gabarito clínico)',
      crmUf: 'SP',
      crmNumber: '000000',
      passwordHash: '!sem-login',
      locale: 'pt-BR',
    },
    select: { id: true },
  });
  return physician.id;
}

export interface PipelineServices {
  orchestrator: OrchestratorService;
  encounters: EncountersService;
  prisma: PrismaService;
  recorder: CompletionRecorder;
  physicianId: string;
  /**
   * Fallback de recusa da Anthropic ativo para o modelo da variante: uma
   * resposta servida por OUTRO modelo é esperada (é o que o médico recebe em
   * produção) e fica marcada; sem fallback ativo, modelo trocado invalida a
   * execução.
   */
  refusalFallback: boolean;
}

/** Mesma decisão do AnthropicProvider: modelo com suporte e AI_REFUSAL_FALLBACK ≠ off. */
export function isRefusalFallbackActive(
  providerName: string,
  model: string,
  config: ConfigService,
): boolean {
  return (
    providerName === 'anthropic' &&
    claudeCapabilities(model).refusalFallback &&
    readChoice(config, 'AI_REFUSAL_FALLBACK', ['default', 'off'] as const, 'default') === 'default'
  );
}

const DEFAULT_CONTEXT = { hasCT: false, isSus: false, hasLab: false, hasICU: false };

type AttemptOutcome =
  | {
      kind: 'answered';
      encounterId: string;
      result: OrchestratorResult;
      retrievedChunkIds: string[];
      completions: RecordedCompletion[];
      wallClockMs: number;
    }
  | {
      kind: 'no_answer';
      status: Exclude<RunStatus, 'ok'>;
      encounterId: string;
      interactionId: string | null;
      validationErrors: string[];
      rawContent: string | null;
      retrievedChunkIds: string[];
      completions: RecordedCompletion[];
      wallClockMs: number;
    }
  | {
      kind: 'infra_error';
      failureClass: FailureClass;
      retryable: boolean;
      message: string;
      completions: RecordedCompletion[];
    };

const VALIDATION_FAILED_MESSAGE = 'AI output validation failed';
const UNSAFE_INPUT_MESSAGE = 'Input contains potentially unsafe content';
// Prefixos que a contenção clínica (F0-C) põe em `errors` ao converter os
// erros tipados do gateway em tentativa inválida.
const TRUNCATION_MARKER = 'OUTPUT TRUNCATED';
const REFUSAL_MARKER = 'MODEL REFUSAL';

function badRequestBody(
  error: unknown,
): { message?: unknown; errors?: unknown; reasons?: unknown } | null {
  if (!(error instanceof BadRequestException)) return null;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null ? body : null;
}

/**
 * "AI output validation failed" cobre três desfechos. Com a contenção clínica
 * (F0-C), truncamento e recusa chegam marcados em `errors`; sem ela, o erro
 * tipado sobe direto (tratado em attemptCase). Na falta de marcador, vale o
 * motivo de parada da ÚLTIMA chamada gravada — a que decidiu a falha.
 */
export function noAnswerStatus(
  validationErrors: string[],
  completions: RecordedCompletion[],
): Exclude<RunStatus, 'ok'> {
  const markers = validationErrors.map((error) => error.trimStart());
  if (markers.some((error) => error.startsWith(REFUSAL_MARKER))) return 'refusal';
  if (markers.some((error) => error.startsWith(TRUNCATION_MARKER))) return 'truncated';
  const stopReason = completions.at(-1)?.stopReason;
  if (stopReason === 'refusal') return 'refusal';
  if (stopReason === 'max_tokens') return 'truncated';
  return 'invalid_output';
}

const TRANSIENT_STATUS = (status: number) => status === 429 || status >= 500;

const PROVIDER_STATUS = /AI provider (?:embed )?error: (\d{3})/;
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string') return code;
  const cause = 'cause' in error ? error.cause : undefined;
  return cause === error ? undefined : errorCode(cause);
}

/** Retry só no que outra tentativa pode resolver: 429, 5xx e rede. */
export function classifyInfraError(error: unknown): {
  failureClass: FailureClass;
  retryable: boolean;
} {
  // Anthropic: erros do SDK oficial (o provider já repete 2x por dentro).
  if (error instanceof Anthropic.APIConnectionError)
    return { failureClass: 'network', retryable: true };
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const transient = TRANSIENT_STATUS(error.status);
    return {
      failureClass: transient ? 'provider_transient' : 'provider_rejected',
      retryable: transient,
    };
  }

  // OpenAI: o provider lança "AI provider error: <status>".
  const message = error instanceof Error ? error.message : String(error);
  const providerStatus = PROVIDER_STATUS.exec(message)?.[1];
  if (providerStatus) {
    const transient = TRANSIENT_STATUS(Number(providerStatus));
    return {
      failureClass: transient ? 'provider_transient' : 'provider_rejected',
      retryable: transient,
    };
  }

  const code = errorCode(error);
  if (code && /^P1\d{3}$/.test(code)) return { failureClass: 'database', retryable: false };
  if (error instanceof Error && error.name.startsWith('PrismaClient')) {
    return { failureClass: 'database', retryable: false };
  }
  if (
    (code && (NETWORK_CODES.has(code) || code.startsWith('UND_ERR'))) ||
    message === 'fetch failed'
  ) {
    return { failureClass: 'network', retryable: true };
  }
  return { failureClass: 'harness', retryable: false };
}

async function storedFailure(prisma: PrismaService, encounterId: string) {
  return prisma.aiInteraction.findFirst({
    where: { encounterId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, retrievedChunkIds: true, rawOutput: true },
  });
}

function rawContentOf(rawOutput: unknown): string | null {
  if (typeof rawOutput !== 'object' || rawOutput === null || !('raw' in rawOutput)) return null;
  return typeof rawOutput.raw === 'string' ? rawOutput.raw : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** `completions` é do chamador: se o teto de tempo estourar, o que já foi gravado não se perde. */
async function attemptCase(
  services: PipelineServices,
  clinicalCase: ClinicalCase,
  completions: RecordedCompletion[],
): Promise<AttemptOutcome> {
  const startedAt = Date.now();
  const context = clinicalCase.input.context ?? DEFAULT_CONTEXT;

  let encounterId: string;
  try {
    const encounter = await services.encounters.create(services.physicianId, {
      vertical: 'general',
      context,
    });
    encounterId = encounter.id;
  } catch (error) {
    return {
      kind: 'infra_error',
      ...classifyInfraError(error),
      message: String(error),
      completions,
    };
  }

  try {
    const result = await services.recorder.run(completions, () =>
      services.orchestrator.analyze(services.physicianId, encounterId, {
        caseText: clinicalCase.input.caseText,
        context,
        redFlags: clinicalCase.input.redFlags,
      }),
    );
    const interaction = await services.prisma.aiInteraction.findUnique({
      where: { id: result.interactionId },
      select: { retrievedChunkIds: true },
    });
    return {
      kind: 'answered',
      encounterId,
      result,
      retrievedChunkIds: interaction?.retrievedChunkIds ?? [],
      completions,
      wallClockMs: Date.now() - startedAt,
    };
  } catch (error) {
    // Gateway sem a contenção clínica: truncamento e recusa sobem como erro
    // tipado, sem interação persistida.
    if (error instanceof AiTruncatedError || error instanceof AiRefusalError) {
      const stored = await storedFailure(services.prisma, encounterId);
      return {
        kind: 'no_answer',
        status: error instanceof AiRefusalError ? 'refusal' : 'truncated',
        encounterId,
        interactionId: stored?.id ?? null,
        validationErrors: [error.message],
        rawContent: null,
        retrievedChunkIds: stored?.retrievedChunkIds ?? [],
        completions,
        wallClockMs: Date.now() - startedAt,
      };
    }

    const body = badRequestBody(error);
    if (body?.message === UNSAFE_INPUT_MESSAGE) {
      return {
        kind: 'infra_error',
        failureClass: 'input_rejected',
        retryable: false,
        message: `O filtro de injeção do pipeline bloqueou o texto do caso: ${stringList(body.reasons).join(', ')}`,
        completions,
      };
    }
    if (body?.message !== VALIDATION_FAILED_MESSAGE) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'infra_error', ...classifyInfraError(error), message, completions };
    }

    const stored = await storedFailure(services.prisma, encounterId);
    const validationErrors = stringList(body.errors);
    return {
      kind: 'no_answer',
      status: noAnswerStatus(validationErrors, completions),
      encounterId,
      interactionId: stored?.id ?? null,
      validationErrors,
      rawContent: rawContentOf(stored?.rawOutput) ?? completions.at(-1)?.content ?? null,
      retrievedChunkIds: stored?.retrievedChunkIds ?? [],
      completions,
      wallClockMs: Date.now() - startedAt,
    };
  }
}

function servedModelMismatch(completions: RecordedCompletion[]): string | null {
  const mismatch = completions.find(
    (completion) =>
      completion.servedModel && !isSameModel(completion.requestedModel, completion.servedModel),
  );
  return mismatch ? `pedido ${mismatch.requestedModel}, servido ${mismatch.servedModel}` : null;
}

function tokenTotals(completions: RecordedCompletion[]) {
  return completions.reduce(
    (totals, completion) => ({
      promptTokens: totals.promptTokens + (completion.usage?.promptTokens ?? 0),
      completionTokens: totals.completionTokens + (completion.usage?.completionTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0 },
  );
}

function computedCost(completions: RecordedCompletion[]): number | null {
  let total = 0;
  for (const completion of completions) {
    if (!completion.usage || !completion.servedModel) continue;
    const cost = costUsd(completion.servedModel, completion.usage);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

export interface CaseRunKey {
  runId: string;
  variant: string;
  rep: number;
}

export type CaseRunRow = { kind: 'result'; row: ResultRow } | { kind: 'error'; row: ErrorRow };

export interface CaseRunOptions {
  caseTimeoutMs: number;
  retryPolicy?: RetryPolicy;
}

type TimedAttempt =
  | { timedOut: true; completions: RecordedCompletion[] }
  | { timedOut: false; outcome: AttemptOutcome };

export async function runCase(
  services: PipelineServices,
  clinicalCase: ClinicalCase,
  key: CaseRunKey,
  options: CaseRunOptions,
): Promise<CaseRunRow> {
  const startedAt = new Date().toISOString();
  const base = { runId: key.runId, variant: key.variant, caseId: clinicalCase.id, rep: key.rep };

  const { result: attempt, attempts } = await retryWhile<TimedAttempt>(
    async () => {
      const completions: RecordedCompletion[] = [];
      const timed = await withTimeout(
        attemptCase(services, clinicalCase, completions),
        options.caseTimeoutMs,
      );
      return timed.timedOut
        ? { timedOut: true, completions: [...completions] }
        : { timedOut: false, outcome: timed.value };
    },
    (timed) => !timed.timedOut && timed.outcome.kind === 'infra_error' && timed.outcome.retryable,
    options.retryPolicy ?? DEFAULT_RETRY_POLICY,
  );

  if (attempt.timedOut) {
    return {
      kind: 'error',
      row: {
        ...base,
        failureClass: 'timeout',
        message: `Caso passou do teto de ${options.caseTimeoutMs} ms`,
        harnessAttempts: attempts,
        completions: attempt.completions,
        startedAt,
      },
    };
  }

  const { outcome } = attempt;
  if (outcome.kind === 'infra_error') {
    return {
      kind: 'error',
      row: {
        ...base,
        failureClass: outcome.failureClass,
        message: outcome.message,
        harnessAttempts: attempts,
        completions: [...outcome.completions],
        startedAt,
      },
    };
  }

  const completions = [...outcome.completions];
  const mismatch = servedModelMismatch(completions);
  const servedByFallback = mismatch !== null && services.refusalFallback;
  if (mismatch && !servedByFallback) {
    return {
      kind: 'error',
      row: {
        ...base,
        failureClass: 'served_model_mismatch',
        message: mismatch,
        harnessAttempts: attempts,
        completions,
        startedAt,
      },
    };
  }

  const shared = {
    ...base,
    harnessAttempts: attempts,
    servedByFallback,
    encounterId: outcome.encounterId,
    retrievedChunkIds: outcome.retrievedChunkIds,
    completions,
    startedAt,
  };
  const tokens = tokenTotals(completions);

  if (outcome.kind === 'no_answer') {
    return {
      kind: 'result',
      row: {
        ...shared,
        status: outcome.status,
        servedModel: completions.at(-1)?.servedModel ?? null,
        interactionId: outcome.interactionId,
        output: null,
        citations: [],
        metadata: null,
        validationErrors: outcome.validationErrors,
        rawContent: outcome.rawContent,
        latency: { pipelineMs: null, wallClockMs: outcome.wallClockMs },
        cost: { pipelineReportedUsd: null, computedUsd: computedCost(completions), ...tokens },
      },
    };
  }

  const { result } = outcome;
  return {
    kind: 'result',
    row: {
      ...shared,
      status: 'ok',
      servedModel: result.metadata.model,
      interactionId: result.interactionId,
      output: result.output,
      citations: result.citations,
      metadata: result.metadata,
      validationErrors: [],
      rawContent: null,
      latency: { pipelineMs: result.metadata.latencyMs, wallClockMs: outcome.wallClockMs },
      cost: {
        pipelineReportedUsd: result.metadata.cost,
        computedUsd: computedCost(completions),
        ...tokens,
      },
    },
  };
}
