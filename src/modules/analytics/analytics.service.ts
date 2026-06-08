import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export interface AnalyticsStats {
  period: string;
  documents: {
    total: number;
    confirmed: number;
    byType: Record<string, number>;
    avgConfirmationMinutes: number | null;
  };
  inference: {
    total: number;
    uncertaintyRate: number;
  };
  generatedAt: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getStats(days = 30): Promise<AnalyticsStats> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [docRows, confirmedRows, inferenceRows] = await Promise.all([
      this.prisma.document.groupBy({
        by: ['type'],
        _count: { id: true },
        where: { createdAt: { gte: since } },
      }),
      this.prisma.document.findMany({
        where: { confirmedAt: { not: null }, createdAt: { gte: since } },
        select: { createdAt: true, confirmedAt: true },
      }),
      this.prisma.aiInteraction.aggregate({
        _count: { id: true },
        _sum: { uncertainty: true } as never,
        where: { createdAt: { gte: since } },
      }),
    ]);

    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of docRows) {
      byType[row.type] = row._count.id;
      total += row._count.id;
    }

    const confirmed = confirmedRows.length;
    const avgConfirmationMinutes =
      confirmed > 0
        ? confirmedRows.reduce((sum: number, d: { createdAt: Date; confirmedAt: Date | null }) => {
            const diffMs = d.confirmedAt!.getTime() - d.createdAt.getTime();
            return sum + diffMs / 60000;
          }, 0) / confirmed
        : null;

    const inferenceTotal = inferenceRows._count.id;

    const uncertainCount = await this.prisma.aiInteraction.count({
      where: { createdAt: { gte: since }, uncertainty: true },
    });
    const uncertaintyRate = inferenceTotal > 0 ? uncertainCount / inferenceTotal : 0;

    this.logger.debug(`Analytics generated for last ${days} days`);

    return {
      period: `last${days}days`,
      documents: {
        total,
        confirmed,
        byType,
        avgConfirmationMinutes:
          avgConfirmationMinutes !== null ? Math.round(avgConfirmationMinutes * 10) / 10 : null,
      },
      inference: {
        total: inferenceTotal,
        uncertaintyRate: Math.round(uncertaintyRate * 1000) / 1000,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
