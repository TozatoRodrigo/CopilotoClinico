import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCallReportService, COSTLIEST_REQUESTS_LIMIT } from './ai-call-report.service';
import type { PrismaService } from '../../config/prisma.service';

/** Uma chamada de `$queryRaw` como o Prisma a recebe: o SQL e os valores ligados. */
interface RawCall {
  sql: string;
  values: unknown[];
}

type RawResponder = (call: RawCall) => unknown[] | undefined;

const NOW = new Date('2026-10-14T12:00:00.000Z');

function stageModelRow(overrides: Record<string, unknown> = {}) {
  return {
    is_total: false,
    stage: 'decision',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    calls: 4,
    ok: 3,
    refusal: 0,
    truncated: 1,
    error: 0,
    aborted: 0,
    usage_limit: 0,
    total_cost: 0.1234567,
    avg_cost: 0.0411522,
    p50: 12_345.5,
    p95: 30_100.4,
    ...overrides,
  };
}

function buildSubject(responder: RawResponder) {
  const rawCalls: RawCall[] = [];
  const prisma = {
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      // Fragmentos `Prisma.sql` aninhados chegam como objetos: o texto deles
      // entra no SQL inspecionado para o responder poder distingui-los.
      const sql = strings.join('?');
      const call = { sql, values };
      rawCalls.push(call);
      return Promise.resolve(responder(call) ?? []);
    }),
    aiCall: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
  };
  const service = new AiCallReportService(prisma as unknown as PrismaService);
  return { prisma, rawCalls, service };
}

function isStageModelQuery({ sql }: RawCall) {
  return sql.includes('GROUPING SETS');
}
function isAnalysesQuery({ sql }: RawCall) {
  return sql.includes("HAVING bool_or(stage = 'decision')");
}
function isCostliestQuery({ sql }: RawCall) {
  return sql.includes('ORDER BY total_cost DESC, started_at DESC');
}

describe('AiCallReportService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getReport (CC-004)', () => {
    it('separa a linha do período das linhas por etapa e modelo, com taxas e custo arredondados', async () => {
      const { service } = buildSubject((call) => {
        if (isStageModelQuery(call)) {
          return [
            stageModelRow({
              is_total: true,
              stage: null,
              provider: null,
              model: null,
              calls: 10,
              ok: 7,
              error: 2,
              truncated: 1,
              usage_limit: 2,
              total_cost: 0.2,
              p50: 8_000.4,
              p95: 29_999.6,
            }),
            stageModelRow(),
            stageModelRow({
              stage: 'understanding',
              model: 'claude-sonnet-5-5',
              calls: 6,
              ok: 4,
              truncated: 0,
              error: 2,
              usage_limit: 2,
              total_cost: 0.0765433,
              avg_cost: null,
              p50: 4_000,
              p95: 6_500,
            }),
          ];
        }
        return [];
      });

      const report = await service.getReport('7d', NOW);

      expect(report.totals).toEqual({
        calls: 10,
        failures: 3,
        failureRate: 0.3,
        usageLimitErrors: 2,
        totalCostUsd: 0.2,
        latency: { p50Ms: 8_000, p95Ms: 30_000 },
      });
      expect(report.byStageModel).toEqual([
        {
          stage: 'decision',
          provider: 'anthropic',
          model: 'claude-opus-5-5',
          calls: 4,
          failures: 1,
          failureRate: 0.25,
          outcomes: { ok: 3, refusal: 0, truncated: 1, error: 0, aborted: 0 },
          usageLimitErrors: 0,
          totalCostUsd: 0.123457,
          avgCostUsd: 0.041152,
          latency: { p50Ms: 12_346, p95Ms: 30_100 },
        },
        expect.objectContaining({
          stage: 'understanding',
          failures: 2,
          failureRate: 0.333,
          usageLimitErrors: 2,
          avgCostUsd: null,
          latency: { p50Ms: 4_000, p95Ms: 6_500 },
        }),
      ]);
    });

    it('calcula p50 e p95 com percentile_cont no banco, para o total e para cada grupo', async () => {
      const { rawCalls, service } = buildSubject(() => []);

      await service.getReport('24h', NOW);

      const stageModel = rawCalls.find(isStageModelQuery)!;
      expect(stageModel.sql).toContain('percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)');
      expect(stageModel.sql).toContain('percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)');
      expect(stageModel.sql).toContain(
        'GROUP BY GROUPING SETS ((stage, provider, requested_model), ())',
      );
    });

    it.each([
      ['24h', '2026-10-13T12:00:00.000Z'],
      ['7d', '2026-10-07T12:00:00.000Z'],
      ['30d', '2026-09-14T12:00:00.000Z'],
    ] as const)('o período %s começa em %s, em todas as consultas', async (period, since) => {
      const { rawCalls, service } = buildSubject(() => []);

      const report = await service.getReport(period, NOW);

      expect(report.since).toBe(since);
      expect(report.period).toBe(period);
      expect(rawCalls).toHaveLength(3);
      for (const call of rawCalls) {
        expect(call.values).toContainEqual(new Date(since));
      }
    });

    it('sem chamada no período devolve zeros e latência nula, sem dividir por zero', async () => {
      const { service } = buildSubject(() => []);

      const report = await service.getReport('7d', NOW);

      expect(report.totals).toEqual({
        calls: 0,
        failures: 0,
        failureRate: 0,
        usageLimitErrors: 0,
        totalCostUsd: 0,
        latency: { p50Ms: null, p95Ms: null },
      });
      expect(report.analyses).toEqual({ count: 0, totalCostUsd: 0, avgCostUsd: null });
      expect(report.byStageModel).toEqual([]);
      expect(report.costliestRequests).toEqual([]);
    });

    it('custo por análise completa = custo das requisições com decisão ÷ número delas', async () => {
      const { service } = buildSubject((call) =>
        isAnalysesQuery(call) ? [{ analyses: 3, total_cost: 0.9 }] : [],
      );

      const report = await service.getReport('30d', NOW);

      expect(report.analyses).toEqual({ count: 3, totalCostUsd: 0.9, avgCostUsd: 0.3 });
    });

    it('lista as requisições mais caras com o início em ISO e o teto de linhas', async () => {
      const { rawCalls, service } = buildSubject((call) =>
        isCostliestQuery(call)
          ? [
              {
                request_id: 'req-cara-0001',
                started_at: new Date('2026-10-14T10:00:00.000Z'),
                calls: 4,
                failures: 1,
                stages: ['decision', 'research', 'understanding'],
                total_cost: 0.3333333,
                total_latency: 45_000,
              },
            ]
          : [],
      );

      const report = await service.getReport('7d', NOW);

      expect(report.costliestRequests).toEqual([
        {
          requestId: 'req-cara-0001',
          startedAt: '2026-10-14T10:00:00.000Z',
          calls: 4,
          failures: 1,
          stages: ['decision', 'research', 'understanding'],
          totalCostUsd: 0.333333,
          totalLatencyMs: 45_000,
        },
      ]);
      expect(rawCalls.find(isCostliestQuery)!.values).toContain(COSTLIEST_REQUESTS_LIMIT);
    });
  });

  describe('getRequestTrace (CC-004)', () => {
    it('lista as chamadas da requisição só com metadados e a versão curta do prompt', async () => {
      const { prisma, service } = buildSubject(() => []);
      prisma.aiCall.findMany.mockResolvedValue([
        {
          id: 'call-1',
          createdAt: new Date('2026-10-14T10:00:00.000Z'),
          stage: 'understanding',
          profile: 'default',
          provider: 'anthropic',
          requestedModel: 'claude-sonnet-5-5',
          servedModel: 'claude-sonnet-5-5',
          effort: 'low',
          promptSha256: 'a'.repeat(64),
          promptTokens: 1000,
          completionTokens: 200,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          costUsd: 0.0123456789,
          latencyMs: 4_000,
          outcome: 'ok',
          errorType: null,
        },
        {
          id: 'call-2',
          createdAt: new Date('2026-10-14T10:00:05.000Z'),
          stage: 'decision',
          profile: 'default',
          provider: 'anthropic',
          requestedModel: 'claude-opus-5-5',
          servedModel: null,
          effort: 'high',
          promptSha256: 'b'.repeat(64),
          promptTokens: null,
          completionTokens: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          costUsd: null,
          latencyMs: 300,
          outcome: 'error',
          errorType: 'BadRequestError:400:usage_limit',
        },
      ]);

      const trace = await service.getRequestTrace('req-12345678');

      const query = prisma.aiCall.findMany.mock.calls[0]![0];
      expect(query.where).toEqual({ requestId: 'req-12345678' });
      expect(query.orderBy).toEqual({ createdAt: 'asc' });
      expect(query.select).not.toHaveProperty('physicianId');
      expect(query.select).not.toHaveProperty('encounterId');

      expect(trace.requestId).toBe('req-12345678');
      expect(trace.totalCostUsd).toBe(0.012346);
      expect(trace.totalLatencyMs).toBe(4_300);
      expect(trace.calls[0]).toEqual(
        expect.objectContaining({
          id: 'call-1',
          createdAt: '2026-10-14T10:00:00.000Z',
          promptVersion: 'aaaaaaaaaaaa',
          costUsd: 0.012346,
        }),
      );
      expect(trace.calls[0]).not.toHaveProperty('promptSha256');
      expect(trace.calls[1]).toEqual(
        expect.objectContaining({ costUsd: null, errorType: 'BadRequestError:400:usage_limit' }),
      );
    });
  });

  describe('medidas do alerta (CC-005)', () => {
    it('soma o custo a partir de um instante', async () => {
      const { prisma, service } = buildSubject(() => []);
      prisma.aiCall.aggregate.mockResolvedValue({
        _count: { _all: 12 },
        _sum: { costUsd: 7.1234567 },
      });
      const since = new Date('2026-10-14T00:00:00.000Z');

      await expect(service.getCostSince(since)).resolves.toEqual({
        calls: 12,
        totalCostUsd: 7.123457,
      });
      expect(prisma.aiCall.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdAt: { gte: since } } }),
      );
    });

    it('custo nulo (nenhuma chamada com uso) vira zero', async () => {
      const { prisma, service } = buildSubject(() => []);
      prisma.aiCall.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { costUsd: null } });

      await expect(service.getCostSince(NOW)).resolves.toEqual({ calls: 0, totalCostUsd: 0 });
    });

    it('p95 de uma etapa: arredonda e devolve o tamanho da amostra', async () => {
      const { rawCalls, service } = buildSubject(() => [{ calls: 5, p95: 41_999.7 }]);
      const since = new Date('2026-10-14T11:00:00.000Z');

      await expect(service.getStageLatencyP95Since('decision', since)).resolves.toEqual({
        calls: 5,
        p95Ms: 42_000,
      });
      expect(rawCalls[0]!.sql).toContain('percentile_cont(0.95)');
      expect(rawCalls[0]!.values).toEqual([since, 'decision']);
    });

    it('p95 sem chamada é nulo', async () => {
      const { service } = buildSubject(() => [{ calls: 0, p95: null }]);

      await expect(service.getStageLatencyP95Since('decision', NOW)).resolves.toEqual({
        calls: 0,
        p95Ms: null,
      });
    });
  });

  describe('análises de uma semana (CC-705)', () => {
    const from = new Date('2026-10-12T03:00:00.000Z');
    const to = new Date('2026-10-16T16:00:00.000Z');

    it('soma custo e latência por análise na janela fechada e tira os percentis entre análises', async () => {
      const { rawCalls, service } = buildSubject(() => [
        { analyses: 3, total_cost: 0.6000004, p50: 30_000.4, p95: 58_999.6 },
      ]);

      await expect(service.getAnalysisSummary(from, to)).resolves.toEqual({
        count: 3,
        totalCostUsd: 0.6,
        avgCostUsd: 0.2,
        latency: { p50Ms: 30_000, p95Ms: 59_000 },
      });
      expect(rawCalls[0]!.sql).toContain("HAVING bool_or(stage = 'decision')");
      expect(rawCalls[0]!.sql).toContain('sum(latency_ms)');
      expect(rawCalls[0]!.values).toEqual([from, to]);
    });

    it('semana sem análise: custo zero, média e latência nulas', async () => {
      const { service } = buildSubject(() => [
        { analyses: 0, total_cost: null, p50: null, p95: null },
      ]);

      await expect(service.getAnalysisSummary(from, to)).resolves.toEqual({
        count: 0,
        totalCostUsd: 0,
        avgCostUsd: null,
        latency: { p50Ms: null, p95Ms: null },
      });
    });
  });
});
