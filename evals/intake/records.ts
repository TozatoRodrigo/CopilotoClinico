import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AI_EFFORTS } from '../../src/modules/ai-gateway/providers/provider.interface';
import { UsageSchema } from '../clinical/records';
import { INTAKE_CASE_SETS, type IntakeCaseSetName } from './case.schema';
import { ExtractedFieldsSchema } from './grading';
import { PROVIDER_FAILURES, StopReasonSchema } from './guard';

/**
 * CC-104 — arquivos de uma rodada (evals/intake/runs/<id>/, fora do git):
 * run.json (o que rodou), rows.jsonl (uma linha por modelo × caso ×
 * repetição) e report.md. A nota não é gravada: o relatório a refaz a partir
 * das linhas e do gabarito atual (`--report`).
 */

/** Uma chamada ao modelo: os mesmos metadados do rastro ai_calls, mais o custo. */
export const CallRecordSchema = z.object({
  /** A referência pedida (`perfil:modelo`). */
  requestedModel: z.string(),
  servedModel: z.string().nullable(),
  latencyMs: z.number(),
  usage: UsageSchema.nullable(),
  /** `null` = modelo sem preço na tabela ("desconhecido", nunca US$ 0). */
  costUsd: z.number().nullable(),
  failure: z.enum(PROVIDER_FAILURES).nullable(),
  /** Classe e status do erro (ex.: `BadRequestError:400`), nunca a mensagem. */
  errorType: z.string().nullable(),
});

export type CallRecord = z.infer<typeof CallRecordSchema>;

/**
 * Desfecho da leitura. Os três primeiros são o caminho do portão
 * (intake-gate.ts) sobre uma leitura válida; os demais, leitura que não veio.
 */
export const READING_OUTCOMES = [
  'ask',
  'unstable',
  'complete',
  'invalid_output',
  'refusal',
  'truncated',
  'provider_error',
  'timeout',
  'stopped',
] as const;
export type ReadingOutcome = (typeof READING_OUTCOMES)[number];

export const VALID_READING_OUTCOMES: ReadonlySet<ReadingOutcome> = new Set([
  'ask',
  'unstable',
  'complete',
]);

export const ReadingRowSchema = z.object({
  /** Referência do modelo como veio no `--model` (`perfil:modelo`). */
  model: z.string(),
  caseId: z.string(),
  rep: z.number().int().min(0),
  /** Tentativas do caso: limite de taxa e erro de servidor refazem a leitura inteira. */
  attempts: z.number().int().min(1),
  outcome: z.enum(READING_OUTCOMES),
  /** Falha do provedor na última chamada, quando houve. */
  failure: z.enum(PROVIDER_FAILURES).nullable(),
  servedModel: z.string().nullable(),
  /** Da chamada da leitura até a leitura validada (retry incluído); `null` sem desfecho. */
  readingMs: z.number().nullable(),
  /** Do caso recebido até a primeira pergunta decidida pelo portão; `null` quando não pergunta. */
  firstQuestionMs: z.number().nullable(),
  /** Perguntas que passaram pelo portão, para ler a qualidade. */
  questions: z.array(z.string()),
  fields: ExtractedFieldsSchema.nullable(),
  piiDetected: z.boolean(),
  /** Chamadas de todas as tentativas: todas custaram. */
  calls: z.array(CallRecordSchema),
});

export type ReadingRow = z.infer<typeof ReadingRowSchema>;

export const ModelRouteSchema = z.object({
  ref: z.string(),
  profile: z.string(),
  provider: z.string(),
  model: z.string(),
});

export type ModelRoute = z.infer<typeof ModelRouteSchema>;

export const RunMetaSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  git: z.object({ commit: z.string().nullable(), dirty: z.boolean().nullable() }),
  caseSet: z.object({
    set: z.enum(Object.keys(INTAKE_CASE_SETS) as [IntakeCaseSetName, ...IntakeCaseSetName[]]),
    version: z.string(),
    selector: z.string().nullable(),
    caseIds: z.array(z.string()),
  }),
  models: z.array(ModelRouteSchema),
  reps: z.number().int(),
  concurrency: z.number().int(),
  caseTimeoutMs: z.number().int(),
  maxUsd: z.number(),
  settings: z.object({
    effort: z.enum(AI_EFFORTS),
    structuredOutput: z.boolean(),
    /** Teto da leitura em produção: passou dele, o caso vai ao plano sem perguntas. */
    productionTimeoutMs: z.number().int(),
  }),
  plannedTasks: z.number().int(),
  /** Gasto somado pelo freio, inclusive chamadas abandonadas pelo teto de tempo. */
  spentUsd: z.number(),
  stop: StopReasonSchema.nullable(),
});

export type RunMeta = z.infer<typeof RunMetaSchema>;

export const RUN_FILES = {
  meta: 'run.json',
  rows: 'rows.jsonl',
  report: 'report.md',
} as const;

export function readRunMeta(runDir: string): RunMeta {
  return RunMetaSchema.parse(JSON.parse(readFileSync(join(runDir, RUN_FILES.meta), 'utf-8')));
}

export function writeRunMeta(runDir: string, meta: RunMeta): void {
  writeFileSync(join(runDir, RUN_FILES.meta), `${JSON.stringify(meta, null, 2)}\n`);
}
