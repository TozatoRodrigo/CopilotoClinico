/**
 * CC-004 — painel de custo e latência das chamadas de IA (`ai_calls`), no
 * console admin. Só metadados da chamada: nenhum texto do caso, do prompt ou
 * da resposta, e nenhum id de paciente, médico ou atendimento.
 */

/** Para que serve a chamada; diz qual prompt e qual modelo estavam em jogo. */
export const AI_CALL_STAGES = [
  'intake_reading',
  'understanding',
  'decision',
  'research',
  'verify_attach',
  'guideline_classification',
  'other',
] as const;
export type AiCallStage = (typeof AI_CALL_STAGES)[number];

export const AI_CALL_OUTCOMES = ['ok', 'refusal', 'truncated', 'error', 'aborted'] as const;
export type AiCallOutcome = (typeof AI_CALL_OUTCOMES)[number];

/** Janela do painel, sempre contada para trás a partir de agora. */
export const AI_CALL_REPORT_PERIODS = ['24h', '7d', '30d'] as const;
export type AiCallReportPeriod = (typeof AI_CALL_REPORT_PERIODS)[number];

/** Chamadas por desfecho; `ok` é a única que não conta como falha. */
export type AiCallOutcomeCounts = Record<AiCallOutcome, number>;

/** Latência em ms; `null` quando não há chamada no grupo. */
export interface AiCallLatency {
  p50Ms: number | null;
  p95Ms: number | null;
}

/**
 * Uma linha por etapa × provedor × modelo pedido. O modelo é o pedido, não o
 * servido: a chamada que falha não tem modelo servido, e é o pedido que o
 * roteamento escolhe.
 */
export interface AiCallStageModelRow {
  /** Uma das `AI_CALL_STAGES`; `string` porque a coluna aceita etapas futuras. */
  stage: string;
  provider: string;
  model: string;
  calls: number;
  /** Chamadas com desfecho diferente de `ok`. */
  failures: number;
  /** 0 a 1. */
  failureRate: number;
  outcomes: AiCallOutcomeCounts;
  /** Chamadas recusadas pelo provedor por limite de uso ou falta de crédito. */
  usageLimitErrors: number;
  totalCostUsd: number;
  /** Média das chamadas com custo conhecido; `null` se nenhuma tem. */
  avgCostUsd: number | null;
  latency: AiCallLatency;
}

/** Tudo o que uma requisição (um `x-request-id`) chamou, somado. */
export interface AiCallRequestSummary {
  requestId: string;
  startedAt: string;
  calls: number;
  failures: number;
  stages: string[];
  totalCostUsd: number;
  /** Soma das latências das chamadas (não é o tempo de parede da requisição). */
  totalLatencyMs: number;
}

export interface AiCallReport {
  period: AiCallReportPeriod;
  since: string;
  generatedAt: string;
  totals: {
    calls: number;
    failures: number;
    failureRate: number;
    usageLimitErrors: number;
    totalCostUsd: number;
    latency: AiCallLatency;
  };
  /**
   * Análise completa = requisição com chamada da etapa `decision`. O custo
   * soma todas as chamadas da requisição (entendimento, pesquisa, decisão,
   * verificação). A leitura do caso do Copiloto guiado é outra requisição.
   */
  analyses: {
    count: number;
    totalCostUsd: number;
    avgCostUsd: number | null;
  };
  byStageModel: AiCallStageModelRow[];
  /** As requisições mais caras do período, da mais cara para a mais barata. */
  costliestRequests: AiCallRequestSummary[];
  disclaimer: string;
}

/**
 * CC-705 — análises completas de uma janela fechada (a semana do painel do
 * beta), com a mesma definição de `AiCallReport.analyses`. A latência é a
 * soma das latências das chamadas de cada análise (as etapas rodam em
 * sequência), em percentis entre as análises.
 */
export interface AiCallAnalysisSummary {
  count: number;
  totalCostUsd: number;
  avgCostUsd: number | null;
  latency: AiCallLatency;
}

/** Uma chamada da requisição buscada, em ordem de início. */
export interface AiCallTraceRow {
  id: string;
  createdAt: string;
  stage: string;
  profile: string;
  provider: string;
  requestedModel: string;
  servedModel: string | null;
  effort: string | null;
  /** Primeiros 12 caracteres do SHA-256 do system prompt: a versão do prompt. */
  promptVersion: string;
  promptTokens: number | null;
  completionTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  outcome: string;
  /** Classe do erro e status HTTP, nunca a mensagem. */
  errorType: string | null;
}

export interface AiCallRequestTrace {
  requestId: string;
  calls: AiCallTraceRow[];
  totalCostUsd: number;
  totalLatencyMs: number;
}
