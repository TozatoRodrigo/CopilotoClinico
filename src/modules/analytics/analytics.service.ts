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

// PI-02 — painel de custo de IA (transparência prometida ao Dr. Ripardo em
// reunião: "eu coloco tudo para vocês [...] porque aí a gente vai ter que
// pôr no preço isso"). Responde diretamente "quanto custaria abrir para N
// usuários" sem depender de exportar o painel da OpenAI manualmente.
export interface CostByPhysician {
  physicianId: string;
  name: string | null;
  email: string;
  totalCost: number;
  /** turnIndex === 0 — análises iniciais (1 por caso). */
  analysesCount: number;
  /** turnIndex > 0 — turnos de reanálise (impacto da Sprint 26 no custo). */
  reanalysisTurns: number;
  avgLatencyMs: number;
}

export interface CostByModel {
  model: string;
  totalCost: number;
  count: number;
  avgLatencyMs: number;
}

export interface CostByDay {
  date: string; // YYYY-MM-DD
  cost: number;
}

export interface AiCostReport {
  period: { days: number; since: string; generatedAt: string };
  totals: {
    totalCost: number;
    interactionCount: number;
    encounterCount: number;
    avgCostPerCase: number | null;
    avgCostPerAnalysis: number | null;
    /** Nº médio de turnos de IA por caso — mede o efeito do fluxo de perguntas da Sprint 26 no custo. */
    avgTurnsPerCase: number | null;
  };
  byPhysician: CostByPhysician[];
  byModel: CostByModel[];
  byDay: CostByDay[];
  projection: {
    projectedUsers: number;
    avgCostPerPhysicianPerMonth: number | null;
    projectedMonthlyCost: number | null;
  };
  /**
   * `AiInteraction.cost` é uma ESTIMATIVA calculada por
   * `calculateInferenceCost` a partir de tokens reportados pelo provider,
   * não o valor faturado. Deve ser conciliado com a fatura real do provider
   * periodicamente — ver critério de aceite da PI-02.
   */
  disclaimer: string;
}

const COST_DISCLAIMER =
  'Custo estimado a partir de tokens reportados pelo provedor de IA — não é o valor faturado. Concilie periodicamente com o extrato real do provedor.';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

  /**
   * PI-02 — agrega custo/latência de IA por médico, modelo e dia, mais a
   * projeção de custo mensal para N usuários que fecha a decisão de escalar
   * o piloto.
   *
   * O join com Physician é feito em memória (mesmo padrão de
   * encounters.service.ts#getLatestInteractionSummaries): em escala de
   * piloto (baixos milhares de interações no período) isso é preferível a
   * uma coluna denormalizada em AiInteraction. Revisitar se o volume crescer
   * muito — ver também o teste de performance com volume simulado.
   */
  async getCostReport(days = 30, projectedUsers = 100): Promise<AiCostReport> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const interactions = await this.prisma.aiInteraction.findMany({
      where: { createdAt: { gte: since } },
      select: {
        encounterId: true,
        model: true,
        cost: true,
        latencyMs: true,
        turnIndex: true,
        createdAt: true,
        encounter: {
          select: {
            physicianId: true,
            physician: { select: { name: true, email: true } },
          },
        },
      },
    });

    let totalCost = 0;
    const encounterIds = new Set<string>();
    const byPhysician = new Map<
      string,
      {
        name: string | null;
        email: string;
        totalCost: number;
        analysesCount: number;
        reanalysisTurns: number;
        latencySum: number;
        latencyCount: number;
      }
    >();
    const byModel = new Map<string, { totalCost: number; count: number; latencySum: number }>();
    const byDay = new Map<string, number>();

    for (const i of interactions) {
      totalCost += i.cost;
      encounterIds.add(i.encounterId);

      const pid = i.encounter.physicianId;
      let physicianEntry = byPhysician.get(pid);
      if (!physicianEntry) {
        physicianEntry = {
          name: i.encounter.physician.name,
          email: i.encounter.physician.email,
          totalCost: 0,
          analysesCount: 0,
          reanalysisTurns: 0,
          latencySum: 0,
          latencyCount: 0,
        };
        byPhysician.set(pid, physicianEntry);
      }
      physicianEntry.totalCost += i.cost;
      if (i.turnIndex === 0) physicianEntry.analysesCount += 1;
      else physicianEntry.reanalysisTurns += 1;
      physicianEntry.latencySum += i.latencyMs;
      physicianEntry.latencyCount += 1;

      let modelEntry = byModel.get(i.model);
      if (!modelEntry) {
        modelEntry = { totalCost: 0, count: 0, latencySum: 0 };
        byModel.set(i.model, modelEntry);
      }
      modelEntry.totalCost += i.cost;
      modelEntry.count += 1;
      modelEntry.latencySum += i.latencyMs;

      const dayKey = i.createdAt.toISOString().slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + i.cost);
    }

    const interactionCount = interactions.length;
    const encounterCount = encounterIds.size;
    const distinctPhysicianCount = byPhysician.size;

    const avgCostPerPhysicianForPeriod =
      distinctPhysicianCount > 0 ? totalCost / distinctPhysicianCount : null;
    // Normaliza o período selecionado (ex.: 7 dias) para uma taxa mensal
    // (30 dias) comparável, independente do filtro de período escolhido.
    const avgCostPerPhysicianPerMonth =
      avgCostPerPhysicianForPeriod !== null ? (avgCostPerPhysicianForPeriod / days) * 30 : null;

    this.logger.debug(
      `Cost report generated for last ${days} days: ${interactionCount} interactions, ${round2(totalCost)} total`,
    );

    return {
      period: { days, since: since.toISOString(), generatedAt: new Date().toISOString() },
      totals: {
        totalCost: round2(totalCost),
        interactionCount,
        encounterCount,
        avgCostPerCase: encounterCount > 0 ? round2(totalCost / encounterCount) : null,
        avgCostPerAnalysis: interactionCount > 0 ? round2(totalCost / interactionCount) : null,
        avgTurnsPerCase:
          encounterCount > 0 ? Math.round((interactionCount / encounterCount) * 100) / 100 : null,
      },
      byPhysician: [...byPhysician.entries()]
        .map(([physicianId, e]) => ({
          physicianId,
          name: e.name,
          email: e.email,
          totalCost: round2(e.totalCost),
          analysesCount: e.analysesCount,
          reanalysisTurns: e.reanalysisTurns,
          avgLatencyMs: e.latencyCount > 0 ? Math.round(e.latencySum / e.latencyCount) : 0,
        }))
        .sort((a, b) => b.totalCost - a.totalCost),
      byModel: [...byModel.entries()]
        .map(([model, e]) => ({
          model,
          totalCost: round2(e.totalCost),
          count: e.count,
          avgLatencyMs: e.count > 0 ? Math.round(e.latencySum / e.count) : 0,
        }))
        .sort((a, b) => b.totalCost - a.totalCost),
      byDay: [...byDay.entries()]
        .map(([date, cost]) => ({ date, cost: round2(cost) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      projection: {
        projectedUsers,
        avgCostPerPhysicianPerMonth:
          avgCostPerPhysicianPerMonth !== null ? round2(avgCostPerPhysicianPerMonth) : null,
        projectedMonthlyCost:
          avgCostPerPhysicianPerMonth !== null
            ? round2(avgCostPerPhysicianPerMonth * projectedUsers)
            : null,
      },
      disclaimer: COST_DISCLAIMER,
    };
  }
}
