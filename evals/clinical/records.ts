import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  StoredCopilotOutputSchema,
  StoredRecommendationSchema,
} from '../../src/modules/copilot/guardrails/output-validator';
import {
  CITATION_ORIGINS,
  DECISION_PROMPT_VERSIONS,
  KNOWLEDGE_SOURCES,
  PRELIMINARY_REASONS,
} from '../../src/shared/contracts/clinical';
import { CaseUnderstandingSchema } from '../../src/modules/copilot/understanding/case-understanding.schema';
import { REASONING_MODES } from '../../src/modules/copilot/understanding/understanding.settings';
import { DeterministicGradeSchema, RUN_STATUSES } from './graders/deterministic';
import { JudgeOutcomeSchema } from './graders/judge';

/**
 * F0-A — Formato dos arquivos de uma execução. Escritos pelo runner e lidos
 * de volta pela regravação de notas e pelo comparador, sempre validados:
 * uma linha corrompida falha alto em vez de virar zero no relatório.
 *
 * - results.jsonl: uma linha por (caso, repetição) que produziu desfecho
 *   avaliável — inclusive "sem resposta".
 * - errors.jsonl: falha de infraestrutura. Nunca pontua.
 * - grades.jsonl: notas determinísticas e do juiz por linha de results.
 */

/** Espelha CompletionUsage do gateway (cache é subconjunto de promptTokens). */
const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
});

export const RecordedCompletionSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() }),
  ),
  requestedModel: z.string(),
  servedModel: z.string().nullable(),
  content: z.string().nullable(),
  /** `max_tokens`/`refusal` vêm dos erros tipados do gateway; `null` = parada normal. */
  stopReason: z.enum(['max_tokens', 'refusal']).nullable(),
  refusalCategory: z.string().nullable(),
  usage: UsageSchema.nullable(),
  latencyMs: z.number(),
  error: z.string().nullable(),
});

/**
 * Recomendação como o orquestrador a devolve: saída do modelo (v1 ou v2) mais
 * o motivo do preliminar e a origem da fonte. Explícitos porque o zod
 * descarta campo desconhecido na releitura do results.jsonl — sem eles, a
 * nota perderia o motivo do preliminar (F0-C) e a camada da decisão v2 (F1).
 */
const ResultRecommendationSchema = StoredRecommendationSchema.extend({
  preliminaryReason: z.enum(PRELIMINARY_REASONS).optional(),
  origin: z.enum(CITATION_ORIGINS).optional(),
});

export const ResultOutputSchema = StoredCopilotOutputSchema.extend({
  recommendations: z.array(ResultRecommendationSchema),
});

/** Espelha OrchestratorResult['metadata']; a atribuição no runner confere o tipo. */
const PipelineMetadataSchema = z.object({
  piiDetected: z.boolean(),
  injectionDetected: z.boolean(),
  chunksRetrieved: z.number(),
  /** F1 — `null` quando a base não foi consultada (model_only/web). */
  retrievalCoverage: z.enum(['full', 'partial', 'none']).nullable(),
  officialChunksRetrieved: z.number(),
  latencyMs: z.number(),
  cost: z.number(),
  model: z.string(),
  turnIndex: z.number(),
  maxTurns: z.number(),
  /** F1 — só com COPILOT_REASONING=stages. */
  understandingLatencyMs: z.number().optional(),
  /** F1 — execuções anteriores eram internal_kb + v1. */
  knowledgeSource: z.enum(KNOWLEDGE_SOURCES).default('internal_kb'),
  decisionPrompt: z.enum(DECISION_PROMPT_VERSIONS).default('v1'),
  /** F1 — só quando a pesquisa web rodou. */
  researchLatencyMs: z.number().optional(),
});

const RowKeySchema = z.object({
  runId: z.string(),
  variant: z.string(),
  caseId: z.string(),
  rep: z.number().int(),
});

export const ResultRowSchema = RowKeySchema.extend({
  status: z.enum(RUN_STATUSES),
  /** Tentativas do runner (retry de falha transitória), não do pipeline. */
  harnessAttempts: z.number().int(),
  servedModel: z.string().nullable(),
  /**
   * Resposta servida pelo modelo de fallback de recusa (AI_REFUSAL_FALLBACK):
   * é o que o médico receberia em produção, mas não é o modelo da variante.
   */
  servedByFallback: z.boolean(),
  encounterId: z.string(),
  interactionId: z.string().nullable(),
  /** Saída como o orquestrador devolveu (com fonte de cada recomendação). */
  output: ResultOutputSchema.nullable(),
  /**
   * F1 — Etapa 1 (ADR-013), fora de `output` porque o schema da saída do
   * modelo não a conhece. `null` no legacy, quando a etapa falhou e em
   * execuções anteriores à Fase 1.
   */
  understanding: CaseUnderstandingSchema.nullable().default(null),
  citations: z.array(z.record(z.string(), z.unknown())),
  metadata: PipelineMetadataSchema.nullable(),
  retrievedChunkIds: z.array(z.string()),
  /** Só para "sem resposta": erros do validador de saída e o texto cru. */
  validationErrors: z.array(z.string()),
  rawContent: z.string().nullable(),
  /** Todas as chamadas ao modelo feitas no caso, inclusive o retry de validação. */
  completions: z.array(RecordedCompletionSchema),
  latency: z.object({
    /** metadata.latencyMs do pipeline (inclui retrieval e o retry interno). */
    pipelineMs: z.number().nullable(),
    /** Relógio da última tentativa do runner, de ponta a ponta. */
    wallClockMs: z.number(),
  }),
  cost: z.object({
    pipelineReportedUsd: z.number().nullable(),
    /** Calculado de tokens × preço do modelo servido (pricing.ts); null se sem preço. */
    computedUsd: z.number().nullable(),
    promptTokens: z.number(),
    completionTokens: z.number(),
  }),
  startedAt: z.string(),
});

export type ResultRow = z.infer<typeof ResultRowSchema>;

export const FAILURE_CLASSES = [
  'timeout',
  'provider_transient',
  'provider_rejected',
  'network',
  'database',
  'served_model_mismatch',
  'input_rejected',
  'harness',
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const ErrorRowSchema = RowKeySchema.extend({
  failureClass: z.enum(FAILURE_CLASSES),
  message: z.string(),
  harnessAttempts: z.number().int(),
  completions: z.array(RecordedCompletionSchema),
  startedAt: z.string(),
});

export type ErrorRow = z.infer<typeof ErrorRowSchema>;

export const CriticalErrorSchema = z.object({
  value: z.boolean(),
  /** false quando parte da checagem dependia do juiz e ele não rodou ou falhou. */
  complete: z.boolean(),
  reasons: z.array(z.string()),
});

export const GradeRowSchema = RowKeySchema.extend({
  status: z.enum(RUN_STATUSES),
  critical: z.boolean(),
  deterministic: DeterministicGradeSchema,
  /** null quando a execução rodou com --judge none ou não houve resposta a julgar. */
  judge: JudgeOutcomeSchema.nullable(),
  criticalError: CriticalErrorSchema,
});

export type GradeRow = z.infer<typeof GradeRowSchema>;

export const RunMetaSchema = z.object({
  runId: z.string(),
  variant: z.object({
    name: z.string(),
    description: z.string(),
    /** Overrides como escritos no arquivo de variantes, com segredos omitidos. */
    env: z.record(z.string(), z.string()),
  }),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  git: z.object({ commit: z.string().nullable(), dirty: z.boolean().nullable() }),
  caseSet: z.object({
    version: z.string(),
    selector: z.string().nullable(),
    caseIds: z.array(z.string()),
  }),
  reps: z.number().int(),
  concurrency: z.number().int(),
  caseTimeoutMs: z.number().int(),
  database: z.string(),
  pipeline: z.object({
    completionProvider: z.string(),
    embeddingProvider: z.string(),
    requestedModel: z.string(),
    embeddingModel: z.string(),
    /** AI_MAX_OUTPUT_TOKENS efetivo (o raciocínio conta para o teto). */
    maxOutputTokens: z.number().int(),
    /** AI_EFFORT efetivo; só tem efeito nos Claude atuais. */
    effort: z.string(),
    /** F1 — COPILOT_REASONING efetivo; execuções anteriores à Fase 1 eram legacy. */
    reasoning: z.enum(REASONING_MODES).default('legacy'),
    /** F1 — modelo e esforço da Etapa 1; `null` no legacy. */
    understandingModel: z.string().nullable().default(null),
    understandingEffort: z.string().nullable().default(null),
    structuredOutput: z.boolean(),
    refusalFallback: z.boolean(),
  }),
  knowledgeBase: z.object({
    approvedChunks: z.number(),
    approvedChunksWithEmbedding: z.number(),
    officialChunks: z.number(),
  }),
  judge: z.object({ provider: z.string(), model: z.string(), gradedAt: z.string() }).nullable(),
});

export type RunMeta = z.infer<typeof RunMetaSchema>;

export const RUN_FILES = {
  meta: 'run.json',
  results: 'results.jsonl',
  errors: 'errors.jsonl',
  grades: 'grades.jsonl',
  summary: 'summary.md',
} as const;

export function appendJsonLine(filePath: string, row: unknown): void {
  appendFileSync(filePath, `${JSON.stringify(row)}\n`);
}

export function writeJsonLines(filePath: string, rows: readonly unknown[]): void {
  writeFileSync(filePath, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
}

export function readJsonLines<T>(
  filePath: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const parsed = schema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(
          `${filePath}:${index + 1} fora do formato: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`,
        );
      }
      return parsed.data;
    });
}

export function readRunMeta(runDir: string): RunMeta {
  return RunMetaSchema.parse(JSON.parse(readFileSync(join(runDir, RUN_FILES.meta), 'utf-8')));
}

export function writeRunMeta(runDir: string, meta: RunMeta): void {
  writeFileSync(join(runDir, RUN_FILES.meta), `${JSON.stringify(meta, null, 2)}\n`);
}
