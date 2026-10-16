import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { USAGE_LIMIT_ERROR_SUFFIX } from '../ai-gateway/ai-call-trace';
import type {
  AiCallAnalysisSummary,
  AiCallLatency,
  AiCallReport,
  AiCallReportPeriod,
  AiCallRequestSummary,
  AiCallRequestTrace,
  AiCallStage,
  AiCallStageModelRow,
} from '../../shared/contracts/ai-calls';

const PERIOD_HOURS: Record<AiCallReportPeriod, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

export const COSTLIEST_REQUESTS_LIMIT = 10;

/** Uma requisição chama poucas vezes o modelo; o teto só protege a resposta. */
export const REQUEST_TRACE_CALLS_LIMIT = 200;

/** `error_type` termina no sufixo de cota esgotada (sem `LIKE`: `_` é curinga lá). */
const IS_USAGE_LIMIT_ERROR = Prisma.sql`right(error_type, ${USAGE_LIMIT_ERROR_SUFFIX.length}::int) = ${USAGE_LIMIT_ERROR_SUFFIX}`;

const COST_DISCLAIMER =
  'Custo estimado pelos tokens que o provedor informa e pela tabela de preços do código, não o valor faturado. Chamada sem uso informado ou de modelo sem preço conhecido entra sem custo.';

/** Linha da agregação por etapa × provedor × modelo; `is_total` é a linha do período inteiro. */
interface StageModelSqlRow {
  is_total: boolean;
  stage: string | null;
  provider: string | null;
  model: string | null;
  calls: number;
  ok: number;
  refusal: number;
  truncated: number;
  error: number;
  aborted: number;
  usage_limit: number;
  total_cost: number | null;
  avg_cost: number | null;
  p50: number | null;
  p95: number | null;
}

interface AnalysesSqlRow {
  analyses: number;
  total_cost: number | null;
}

interface AnalysisSummarySqlRow extends AnalysesSqlRow {
  p50: number | null;
  p95: number | null;
}

interface RequestSqlRow {
  request_id: string;
  started_at: Date;
  calls: number;
  failures: number;
  stages: string[];
  total_cost: number;
  total_latency: number;
}

interface StageLatencySqlRow {
  calls: number;
  p95: number | null;
}

interface UsageLimitSqlRow {
  provider: string;
  calls: number;
}

/** Custo é fração de centavo por chamada: 6 casas guardam o que importa. */
function roundUsd(value: number | null): number {
  return Math.round((value ?? 0) * 1e6) / 1e6;
}

function roundMs(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function rate(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 1000 : 0;
}

function latencyOf(row: Pick<StageModelSqlRow, 'p50' | 'p95'>): AiCallLatency {
  return { p50Ms: roundMs(row.p50), p95Ms: roundMs(row.p95) };
}

function stageModelRowOf(row: StageModelSqlRow): AiCallStageModelRow {
  return {
    stage: row.stage ?? 'other',
    provider: row.provider ?? '-',
    model: row.model ?? '-',
    calls: row.calls,
    failures: row.calls - row.ok,
    failureRate: rate(row.calls - row.ok, row.calls),
    outcomes: {
      ok: row.ok,
      refusal: row.refusal,
      truncated: row.truncated,
      error: row.error,
      aborted: row.aborted,
    },
    usageLimitErrors: row.usage_limit,
    totalCostUsd: roundUsd(row.total_cost),
    avgCostUsd: row.avg_cost === null ? null : roundUsd(row.avg_cost),
    latency: latencyOf(row),
  };
}

function requestSummaryOf(row: RequestSqlRow): AiCallRequestSummary {
  return {
    requestId: row.request_id,
    startedAt: row.started_at.toISOString(),
    calls: row.calls,
    failures: row.failures,
    stages: row.stages,
    totalCostUsd: roundUsd(row.total_cost),
    totalLatencyMs: row.total_latency,
  };
}

/**
 * CC-004 — agrega `ai_calls` por etapa e modelo para o console admin, e dá ao
 * alerta da CC-005 as mesmas medidas. Percentis por `percentile_cont` no
 * Postgres (interpolação linear, como a consulta do runbook): o volume do
 * período nunca sai do banco. Só metadados: nada do caso, e nenhum id de
 * médico, paciente ou atendimento na resposta.
 */
@Injectable()
export class AiCallReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getReport(period: AiCallReportPeriod, now: Date = new Date()): Promise<AiCallReport> {
    const since = new Date(now.getTime() - PERIOD_HOURS[period] * 60 * 60 * 1000);

    const [stageModelRows, analysesRows, costliestRows] = await Promise.all([
      this.queryStageModel(since),
      this.queryAnalyses(since),
      this.queryCostliestRequests(since),
    ]);

    const totalRow = stageModelRows.find((row) => row.is_total);
    const calls = totalRow?.calls ?? 0;
    const failures = calls - (totalRow?.ok ?? 0);
    const analyses = analysesRows[0] ?? { analyses: 0, total_cost: null };
    const analysesCost = roundUsd(analyses.total_cost);

    return {
      period,
      since: since.toISOString(),
      generatedAt: now.toISOString(),
      totals: {
        calls,
        failures,
        failureRate: rate(failures, calls),
        usageLimitErrors: totalRow?.usage_limit ?? 0,
        totalCostUsd: roundUsd(totalRow?.total_cost ?? null),
        latency: totalRow ? latencyOf(totalRow) : { p50Ms: null, p95Ms: null },
      },
      analyses: {
        count: analyses.analyses,
        totalCostUsd: analysesCost,
        avgCostUsd: analyses.analyses > 0 ? roundUsd(analysesCost / analyses.analyses) : null,
      },
      byStageModel: stageModelRows
        .filter((row) => !row.is_total && row.calls > 0)
        .map(stageModelRowOf),
      costliestRequests: costliestRows.map(requestSummaryOf),
      disclaimer: COST_DISCLAIMER,
    };
  }

  /** Todas as chamadas de uma requisição (o `x-request-id` que o médico ou o suporte citam). */
  async getRequestTrace(requestId: string): Promise<AiCallRequestTrace> {
    const rows = await this.prisma.aiCall.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      take: REQUEST_TRACE_CALLS_LIMIT,
      select: {
        id: true,
        createdAt: true,
        stage: true,
        profile: true,
        provider: true,
        requestedModel: true,
        servedModel: true,
        effort: true,
        promptSha256: true,
        promptTokens: true,
        completionTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
        costUsd: true,
        latencyMs: true,
        outcome: true,
        errorType: true,
      },
    });

    return {
      requestId,
      calls: rows.map(({ promptSha256, createdAt, costUsd, ...row }) => ({
        ...row,
        createdAt: createdAt.toISOString(),
        promptVersion: promptSha256.slice(0, 12),
        costUsd: costUsd === null ? null : roundUsd(costUsd),
      })),
      totalCostUsd: roundUsd(rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0)),
      totalLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0),
    };
  }

  /**
   * CC-705 — análises completas de uma janela fechada `[from, to)`, para o
   * painel semanal do beta. Mesma definição de `getReport().analyses`; a
   * latência de cada análise é a soma das latências das suas chamadas.
   */
  async getAnalysisSummary(from: Date, to: Date): Promise<AiCallAnalysisSummary> {
    const rows = await this.prisma.$queryRaw<AnalysisSummarySqlRow[]>`
      WITH analyses AS (
        SELECT request_id, sum(cost_usd) AS cost, sum(latency_ms) AS latency
        FROM ai_calls
        WHERE created_at >= ${from} AND created_at < ${to} AND request_id IS NOT NULL
        GROUP BY request_id
        HAVING bool_or(stage = 'decision')
      )
      SELECT count(*)::int AS analyses,
             sum(cost)::float8 AS total_cost,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latency)::float8 AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency)::float8 AS p95
      FROM analyses
    `;
    const row = rows[0];
    const count = row?.analyses ?? 0;
    const totalCostUsd = roundUsd(row?.total_cost ?? null);
    return {
      count,
      totalCostUsd,
      avgCostUsd: count > 0 ? roundUsd(totalCostUsd / count) : null,
      latency: row ? latencyOf(row) : { p50Ms: null, p95Ms: null },
    };
  }

  /** CC-005 — custo somado das chamadas a partir de `since`. */
  async getCostSince(since: Date): Promise<{ calls: number; totalCostUsd: number }> {
    const result = await this.prisma.aiCall.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { costUsd: true },
    });
    return { calls: result._count._all, totalCostUsd: roundUsd(result._sum.costUsd) };
  }

  /** CC-005 — p95 de latência de uma etapa a partir de `since`, com o tamanho da amostra. */
  async getStageLatencyP95Since(
    stage: AiCallStage,
    since: Date,
  ): Promise<{ calls: number; p95Ms: number | null }> {
    const rows = await this.prisma.$queryRaw<StageLatencySqlRow[]>`
      SELECT count(*)::int AS calls,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p95
      FROM ai_calls
      WHERE created_at >= ${since} AND stage = ${stage}
    `;
    const row = rows[0];
    return { calls: row?.calls ?? 0, p95Ms: roundMs(row?.p95 ?? null) };
  }

  /** CC-005 — chamadas recusadas por limite de uso ou falta de crédito, por provedor. */
  async getUsageLimitErrorsSince(since: Date): Promise<UsageLimitSqlRow[]> {
    return this.prisma.$queryRaw<UsageLimitSqlRow[]>`
      SELECT provider, count(*)::int AS calls
      FROM ai_calls
      WHERE created_at >= ${since}
        AND ${IS_USAGE_LIMIT_ERROR}
      GROUP BY provider
      ORDER BY provider
    `;
  }

  /**
   * Por etapa × provedor × modelo pedido, mais a linha do período inteiro
   * (`GROUPING SETS ... ()`): os percentis do total não saem da soma das
   * linhas, então o próprio banco calcula.
   */
  private queryStageModel(since: Date): Promise<StageModelSqlRow[]> {
    return this.prisma.$queryRaw<StageModelSqlRow[]>`
      SELECT GROUPING(stage, provider, requested_model) <> 0 AS is_total,
             stage,
             provider,
             requested_model AS model,
             count(*)::int AS calls,
             count(*) FILTER (WHERE outcome = 'ok')::int AS ok,
             count(*) FILTER (WHERE outcome = 'refusal')::int AS refusal,
             count(*) FILTER (WHERE outcome = 'truncated')::int AS truncated,
             count(*) FILTER (WHERE outcome = 'error')::int AS error,
             count(*) FILTER (WHERE outcome = 'aborted')::int AS aborted,
             count(*) FILTER (WHERE ${IS_USAGE_LIMIT_ERROR})::int AS usage_limit,
             sum(cost_usd)::float8 AS total_cost,
             avg(cost_usd)::float8 AS avg_cost,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float8 AS p95
      FROM ai_calls
      WHERE created_at >= ${since}
      GROUP BY GROUPING SETS ((stage, provider, requested_model), ())
      ORDER BY is_total DESC, total_cost DESC NULLS LAST, calls DESC
    `;
  }

  /** Análise completa = requisição com chamada `decision`; o custo soma a requisição inteira. */
  private queryAnalyses(since: Date): Promise<AnalysesSqlRow[]> {
    return this.prisma.$queryRaw<AnalysesSqlRow[]>`
      WITH requests AS (
        SELECT request_id, sum(cost_usd) AS cost
        FROM ai_calls
        WHERE created_at >= ${since} AND request_id IS NOT NULL
        GROUP BY request_id
        HAVING bool_or(stage = 'decision')
      )
      SELECT count(*)::int AS analyses, sum(cost)::float8 AS total_cost FROM requests
    `;
  }

  private queryCostliestRequests(since: Date): Promise<RequestSqlRow[]> {
    return this.prisma.$queryRaw<RequestSqlRow[]>`
      SELECT request_id,
             min(created_at) AS started_at,
             count(*)::int AS calls,
             count(*) FILTER (WHERE outcome <> 'ok')::int AS failures,
             array_agg(DISTINCT stage ORDER BY stage)::text[] AS stages,
             coalesce(sum(cost_usd), 0)::float8 AS total_cost,
             sum(latency_ms)::int AS total_latency
      FROM ai_calls
      WHERE created_at >= ${since} AND request_id IS NOT NULL
      GROUP BY request_id
      ORDER BY total_cost DESC, started_at DESC
      LIMIT ${COSTLIEST_REQUESTS_LIMIT}::int
    `;
  }
}
