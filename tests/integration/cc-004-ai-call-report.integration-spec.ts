/**
 * Testes de integração — CC-004/CC-005: agregação de `ai_calls` no Postgres.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com a migration
 * 20261013200000_ai_calls_trace aplicada.
 *
 * Cobre o que o teste unitário não alcança: o `percentile_cont` de verdade
 * (interpolação linear), a linha do total do `GROUPING SETS`, o agrupamento
 * por requisição e o filtro do sufixo de cota esgotada. As linhas ficam em
 * 2099 e o relatório é pedido "de lá": nada que outro teste grave entra na
 * janela.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { AiCallReportService } from '../../src/modules/analytics/ai-call-report.service';
import type { PrismaService } from '../../src/config/prisma.service';

const PROFILE = 'cc004';
const NOW = new Date('2099-01-08T12:00:00.000Z');

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

interface Seed {
  requestId: string | null;
  stage: string;
  model: string;
  costUsd: number | null;
  latencyMs: number;
  outcome?: string;
  errorType?: string;
  createdAt: Date;
}

const SEEDS: Seed[] = [
  // req-a e req-b: entendimento + decisão
  {
    requestId: 'req-cc004-a',
    stage: 'understanding',
    model: 'claude-sonnet-5-5',
    costUsd: 0.01,
    latencyMs: 2000,
    createdAt: minutesBefore(50),
  },
  {
    requestId: 'req-cc004-a',
    stage: 'decision',
    model: 'claude-opus-5-5',
    costUsd: 0.1,
    latencyMs: 1000,
    createdAt: minutesBefore(49),
  },
  {
    requestId: 'req-cc004-b',
    stage: 'understanding',
    model: 'claude-sonnet-5-5',
    costUsd: 0.01,
    latencyMs: 4000,
    createdAt: minutesBefore(40),
  },
  {
    requestId: 'req-cc004-b',
    stage: 'decision',
    model: 'claude-opus-5-5',
    costUsd: 0.2,
    latencyMs: 2000,
    createdAt: minutesBefore(39),
  },
  {
    requestId: 'req-cc004-c',
    stage: 'decision',
    model: 'claude-opus-5-5',
    costUsd: 0.3,
    latencyMs: 3000,
    createdAt: minutesBefore(30),
  },
  {
    requestId: 'req-cc004-d',
    stage: 'decision',
    model: 'claude-opus-5-5',
    costUsd: null,
    latencyMs: 4000,
    outcome: 'truncated',
    createdAt: minutesBefore(20),
  },
  {
    requestId: 'req-cc004-e',
    stage: 'decision',
    model: 'claude-opus-5-5',
    costUsd: null,
    latencyMs: 10000,
    outcome: 'error',
    errorType: 'BadRequestError:400:usage_limit',
    createdAt: minutesBefore(5),
  },
  // leitura do caso: outra requisição, sem decisão
  {
    requestId: 'req-cc004-f',
    stage: 'intake_reading',
    model: 'claude-sonnet-5-5',
    costUsd: 0.05,
    latencyMs: 9000,
    createdAt: minutesBefore(60 * 25),
  },
  // classificação de diretriz: fora de requisição HTTP
  {
    requestId: null,
    stage: 'guideline_classification',
    model: 'claude-haiku-5-5',
    costUsd: 0.02,
    latencyMs: 500,
    createdAt: minutesBefore(60 * 48),
  },
  // 400 que não é cota: não entra na contagem de limite de uso
  // (fica fora da janela de 7 dias para não mexer nos números acima)
  {
    requestId: 'req-cc004-old',
    stage: 'decision',
    model: 'claude-opus-5-5',
    costUsd: 5,
    latencyMs: 99_999,
    outcome: 'error',
    errorType: 'BadRequestError:400',
    createdAt: minutesBefore(60 * 24 * 8),
  },
];

describe('CC-004 — agregação de ai_calls (integration)', () => {
  let prisma: PrismaClient;
  let service: AiCallReportService;

  beforeAll(async () => {
    prisma = await connectTestDb();
    service = new AiCallReportService(prisma as unknown as PrismaService);
    await prisma.aiCall.deleteMany({ where: { profile: PROFILE } });
    await prisma.aiCall.createMany({
      data: SEEDS.map((seed) => ({
        requestId: seed.requestId,
        stage: seed.stage,
        profile: PROFILE,
        provider: 'anthropic',
        requestedModel: seed.model,
        servedModel: seed.outcome && seed.outcome !== 'ok' ? null : seed.model,
        promptSha256: 'c'.repeat(64),
        costUsd: seed.costUsd,
        latencyMs: seed.latencyMs,
        outcome: seed.outcome ?? 'ok',
        errorType: seed.errorType ?? null,
        createdAt: seed.createdAt,
      })),
    });
  });

  afterAll(async () => {
    await prisma.aiCall.deleteMany({ where: { profile: PROFILE } });
    await disconnectTestDb();
  });

  it('p50 e p95 por interpolação linear, por grupo e no total do período', async () => {
    const report = await service.getReport('7d', NOW);

    const decision = report.byStageModel.find((row) => row.stage === 'decision')!;
    // [1000, 2000, 3000, 4000, 10000]: p95 = 4000 + 0,8 × 6000
    expect(decision).toEqual({
      stage: 'decision',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      calls: 5,
      failures: 2,
      failureRate: 0.4,
      outcomes: { ok: 3, refusal: 0, truncated: 1, error: 1, aborted: 0 },
      usageLimitErrors: 1,
      totalCostUsd: 0.6,
      avgCostUsd: 0.2,
      latency: { p50Ms: 3000, p95Ms: 8800 },
    });

    const understanding = report.byStageModel.find((row) => row.stage === 'understanding')!;
    // [2000, 4000]: p95 = 2000 + 0,95 × 2000
    expect(understanding.latency).toEqual({ p50Ms: 3000, p95Ms: 3900 });

    // [500, 1000, 2000, 2000, 3000, 4000, 4000, 9000, 10000]: p95 = 9000 + 0,6 × 1000
    expect(report.totals).toEqual({
      calls: 9,
      failures: 2,
      failureRate: 0.222,
      usageLimitErrors: 1,
      totalCostUsd: 0.69,
      latency: { p50Ms: 3000, p95Ms: 9600 },
    });
    expect(report.byStageModel.map((row) => row.stage)).toEqual([
      'decision',
      'intake_reading',
      'understanding',
      'guideline_classification',
    ]);
  });

  it('custo por análise completa soma a requisição inteira das que chamaram a decisão', async () => {
    const report = await service.getReport('7d', NOW);

    // a (0,11), b (0,21), c (0,30), d e e (sem custo) — f não tem decisão
    expect(report.analyses).toEqual({ count: 5, totalCostUsd: 0.62, avgCostUsd: 0.124 });
    expect(report.costliestRequests.slice(0, 4)).toEqual([
      expect.objectContaining({
        requestId: 'req-cc004-c',
        totalCostUsd: 0.3,
        stages: ['decision'],
      }),
      expect.objectContaining({
        requestId: 'req-cc004-b',
        calls: 2,
        totalCostUsd: 0.21,
        totalLatencyMs: 6000,
        stages: ['decision', 'understanding'],
      }),
      expect.objectContaining({ requestId: 'req-cc004-a', totalCostUsd: 0.11 }),
      expect.objectContaining({ requestId: 'req-cc004-f', totalCostUsd: 0.05 }),
    ]);
    expect(report.costliestRequests.map((row) => row.requestId)).not.toContain('req-cc004-old');
  });

  it('a janela de 24 h deixa de fora o que é mais antigo', async () => {
    const report = await service.getReport('24h', NOW);

    expect(report.byStageModel.map((row) => row.stage).sort()).toEqual([
      'decision',
      'understanding',
    ]);
    expect(report.totals.calls).toBe(7);
  });

  it('janela sem chamada devolve zeros (o GROUPING SETS ainda traz a linha do total)', async () => {
    const report = await service.getReport('30d', new Date('2200-01-01T00:00:00.000Z'));

    expect(report.totals).toEqual({
      calls: 0,
      failures: 0,
      failureRate: 0,
      usageLimitErrors: 0,
      totalCostUsd: 0,
      latency: { p50Ms: null, p95Ms: null },
    });
    expect(report.byStageModel).toEqual([]);
    expect(report.analyses).toEqual({ count: 0, totalCostUsd: 0, avgCostUsd: null });
  });

  it('busca por requestId devolve as chamadas em ordem', async () => {
    const trace = await service.getRequestTrace('req-cc004-a');

    expect(trace.calls.map((call) => call.stage)).toEqual(['understanding', 'decision']);
    expect(trace.totalCostUsd).toBe(0.11);
    expect(trace.calls[0]!.promptVersion).toBe('cccccccccccc');
  });

  it('medidas do alerta: custo desde um instante, p95 da decisão na hora e cota esgotada', async () => {
    await expect(service.getCostSince(minutesBefore(60))).resolves.toEqual({
      calls: 7,
      totalCostUsd: 0.62,
    });
    await expect(service.getStageLatencyP95Since('decision', minutesBefore(60))).resolves.toEqual({
      calls: 5,
      p95Ms: 8800,
    });
    await expect(service.getUsageLimitErrorsSince(minutesBefore(10))).resolves.toEqual([
      { provider: 'anthropic', calls: 1 },
    ]);
    // o 400 comum (fora de cota) não conta, mesmo na janela inteira
    await expect(service.getUsageLimitErrorsSince(minutesBefore(60 * 24 * 30))).resolves.toEqual([
      { provider: 'anthropic', calls: 1 },
    ]);
  });
});
