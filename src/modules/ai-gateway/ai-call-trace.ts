import type { AiEffort, CompletionUsage } from './providers/provider.interface';

/** Para que serve a chamada; diz qual prompt e qual modelo estavam em jogo. */
export const AI_CALL_STAGES = [
  'intake_reading',
  'understanding',
  'decision',
  'research',
  'verify_attach',
  'guideline_classification',
  /** CC-801 — perguntas da revisão do plantão, das análises do próprio médico. */
  'review_questions',
  'other',
] as const;
export type AiCallStage = (typeof AI_CALL_STAGES)[number];

export type AiCallOutcome = 'ok' | 'refusal' | 'truncated' | 'error' | 'aborted';

/**
 * Uma chamada ao modelo, só com metadados: nenhum texto do caso, do prompt ou
 * da resposta. `promptSha256` é a impressão digital do system prompt e
 * identifica a versão do prompt que decidiu.
 */
export interface AiCallTrace {
  stage: AiCallStage;
  profile: string;
  provider: string;
  requestedModel: string;
  servedModel: string | null;
  effort: AiEffort | null;
  promptSha256: string;
  responseSchema: string | null;
  usage: CompletionUsage | null;
  latencyMs: number;
  outcome: AiCallOutcome;
  /** Classe do erro (ex.: `RateLimitError`) e status HTTP, nunca a mensagem. */
  errorType: string | null;
}

export const AI_CALL_SINK = Symbol('AI_CALL_SINK');

/** Quem guarda o rastro. Não pode lançar nem atrasar a análise. */
export interface AiCallSink {
  record(trace: AiCallTrace): void;
}
