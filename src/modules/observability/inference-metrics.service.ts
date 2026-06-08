import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export interface InferenceMetricsWindow {
  period: '24h' | '7d';
  from: Date;
  count: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalCostUsd: number;
  avgCostUsd: number;
  perModel: Record<string, { count: number; avgLatencyMs: number; totalCostUsd: number }>;
}

type PercentileRow = { p95: number | null; p99: number | null };
type PerModelRow = {
  model: string;
  count: bigint;
  avg_latency: number | null;
  total_cost: number | null;
};

@Injectable()
export class InferenceMetricsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getMetrics(period: '24h' | '7d'): Promise<InferenceMetricsWindow> {
    const hours = period === '24h' ? 24 : 168;
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Aggregate counts, avg, sum via Prisma
    const aggregate = await this.prisma.aiInteraction.aggregate({
      where: { createdAt: { gte: from } },
      _count: { id: true },
      _avg: { latencyMs: true, cost: true },
      _sum: { cost: true },
    });

    const count = aggregate._count.id;

    // Percentiles via raw SQL (PostgreSQL percentile_cont)
    const percentileRows = await this.prisma.$queryRaw<PercentileRow[]>`
      SELECT
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99
      FROM ai_interactions
      WHERE created_at >= ${from}
    `;

    const p95Row = percentileRows[0] ?? { p95: null, p99: null };

    // Per-model breakdown
    const perModelRows = await this.prisma.$queryRaw<PerModelRow[]>`
      SELECT
        model,
        COUNT(*)::bigint         AS count,
        AVG(latency_ms)::float8  AS avg_latency,
        SUM(cost)::float8        AS total_cost
      FROM ai_interactions
      WHERE created_at >= ${from}
      GROUP BY model
      ORDER BY count DESC
    `;

    const perModel: InferenceMetricsWindow['perModel'] = {};
    for (const row of perModelRows) {
      perModel[row.model] = {
        count: Number(row.count),
        avgLatencyMs: Math.round(row.avg_latency ?? 0),
        totalCostUsd: Number((row.total_cost ?? 0).toFixed(6)),
      };
    }

    return {
      period,
      from,
      count,
      avgLatencyMs: Math.round(aggregate._avg.latencyMs ?? 0),
      p95LatencyMs: Math.round(p95Row.p95 ?? 0),
      p99LatencyMs: Math.round(p95Row.p99 ?? 0),
      totalCostUsd: Number((aggregate._sum.cost ?? 0).toFixed(6)),
      avgCostUsd: Number((aggregate._avg.cost ?? 0).toFixed(8)),
      perModel,
    };
  }
}
