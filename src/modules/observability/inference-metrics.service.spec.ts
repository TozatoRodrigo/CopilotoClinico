import { describe, it, expect, vi } from 'vitest';
import { InferenceMetricsService } from './inference-metrics.service';
import { PrismaService } from '../../config/prisma.service';

function buildMocks() {
  const prisma = {
    aiInteraction: {
      aggregate: vi.fn(),
    },
    $queryRaw: vi.fn(),
  } as unknown as PrismaService;

  const service = new InferenceMetricsService(prisma);
  return { service, prisma };
}

describe('InferenceMetricsService.getMetrics', () => {
  it('returns zero metrics when no interactions exist', async () => {
    const { service, prisma } = buildMocks();

    vi.mocked(prisma.aiInteraction.aggregate).mockResolvedValue({
      _count: { id: 0 },
      _avg: { latencyMs: null, cost: null },
      _sum: { cost: null },
    } as never);

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ p95: null, p99: null }]) // percentiles
      .mockResolvedValueOnce([]); // per-model

    const result = await service.getMetrics('24h');

    expect(result.count).toBe(0);
    expect(result.avgLatencyMs).toBe(0);
    expect(result.p95LatencyMs).toBe(0);
    expect(result.p99LatencyMs).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.perModel).toEqual({});
  });

  it('returns aggregated metrics for 24h period', async () => {
    const { service, prisma } = buildMocks();

    vi.mocked(prisma.aiInteraction.aggregate).mockResolvedValue({
      _count: { id: 100 },
      _avg: { latencyMs: 1234.5, cost: 0.00125 },
      _sum: { cost: 0.125 },
    } as never);

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ p95: 2500, p99: 4200 }])
      .mockResolvedValueOnce([
        { model: 'claude-3-5-sonnet', count: BigInt(80), avg_latency: 1100, total_cost: 0.1 },
        { model: 'gpt-4o', count: BigInt(20), avg_latency: 1800, total_cost: 0.025 },
      ]);

    const result = await service.getMetrics('24h');

    expect(result.period).toBe('24h');
    expect(result.count).toBe(100);
    expect(result.avgLatencyMs).toBe(1235);
    expect(result.p95LatencyMs).toBe(2500);
    expect(result.p99LatencyMs).toBe(4200);
    expect(result.totalCostUsd).toBeCloseTo(0.125, 5);
    expect(result.perModel['claude-3-5-sonnet']).toEqual({
      count: 80,
      avgLatencyMs: 1100,
      totalCostUsd: 0.1,
    });
    expect(result.perModel['gpt-4o']).toEqual({
      count: 20,
      avgLatencyMs: 1800,
      totalCostUsd: 0.025,
    });
  });

  it('uses 168h window for 7d period', async () => {
    const { service, prisma } = buildMocks();

    vi.mocked(prisma.aiInteraction.aggregate).mockResolvedValue({
      _count: { id: 500 },
      _avg: { latencyMs: 950, cost: 0.001 },
      _sum: { cost: 0.5 },
    } as never);

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ p95: 1800, p99: 3000 }])
      .mockResolvedValueOnce([]);

    const beforeCall = Date.now();
    const result = await service.getMetrics('7d');
    const afterCall = Date.now();

    expect(result.period).toBe('7d');
    const windowMs = afterCall - result.from.getTime();
    // Window should be ~7 days (168 hours)
    expect(windowMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 5000);
    expect(windowMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + (afterCall - beforeCall) + 1000);
  });
});
