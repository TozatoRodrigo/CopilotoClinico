import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../config/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    document: {
      groupBy: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    aiInteraction: {
      aggregate: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      document: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      aiInteraction: {
        aggregate: vi.fn().mockResolvedValue({ _count: { id: 0 } }),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  describe('getStats', () => {
    it('returns only non-sensitive aggregate fields without patient data', async () => {
      prisma.document.groupBy.mockResolvedValue([{ type: 'soap', _count: { id: 5 } }]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.aiInteraction.aggregate.mockResolvedValue({ _count: { id: 10 } });
      prisma.aiInteraction.count.mockResolvedValue(2);

      const result = await service.getStats(30);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('documents');
      expect(result).toHaveProperty('inference');
      expect(result).toHaveProperty('generatedAt');

      // No patient-sensitive fields
      expect(result).not.toHaveProperty('patientRef');
      expect(result).not.toHaveProperty('physicianId');
      expect(result.documents).not.toHaveProperty('patientRef');
    });

    it('aggregates byType correctly from multiple document types', async () => {
      prisma.document.groupBy.mockResolvedValue([
        { type: 'soap', _count: { id: 10 } },
        { type: 'prescricao', _count: { id: 5 } },
        { type: 'alta', _count: { id: 3 } },
      ]);

      const result = await service.getStats(30);

      expect(result.documents.byType).toEqual({ soap: 10, prescricao: 5, alta: 3 });
      expect(result.documents.total).toBe(18);
    });

    it('calculates uncertaintyRate correctly', async () => {
      prisma.aiInteraction.aggregate.mockResolvedValue({ _count: { id: 20 } });
      prisma.aiInteraction.count.mockResolvedValue(5);

      const result = await service.getStats(30);

      expect(result.inference.total).toBe(20);
      expect(result.inference.uncertaintyRate).toBe(0.25);
    });

    it('returns uncertaintyRate of 0 when no inferences', async () => {
      prisma.aiInteraction.aggregate.mockResolvedValue({ _count: { id: 0 } });
      prisma.aiInteraction.count.mockResolvedValue(0);

      const result = await service.getStats(30);

      expect(result.inference.uncertaintyRate).toBe(0);
    });

    it('returns avgConfirmationMinutes as null when no confirmed documents', async () => {
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.getStats(30);

      expect(result.documents.confirmed).toBe(0);
      expect(result.documents.avgConfirmationMinutes).toBeNull();
    });

    it('calculates avgConfirmationMinutes when confirmed documents exist', async () => {
      const createdAt = new Date('2025-01-01T10:00:00Z');
      const confirmedAt = new Date('2025-01-01T10:30:00Z'); // 30 minutes later

      prisma.document.findMany.mockResolvedValue([{ createdAt, confirmedAt }]);

      const result = await service.getStats(30);

      expect(result.documents.confirmed).toBe(1);
      expect(result.documents.avgConfirmationMinutes).toBe(30);
    });

    it('sets period based on days parameter', async () => {
      const result = await service.getStats(7);

      expect(result.period).toBe('last7days');
    });

    it('includes generatedAt as ISO string', async () => {
      const result = await service.getStats(30);

      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // PI-02 — painel de custo de IA. Fixture: 2 médicos, 3 casos, 4 interações.
  //   phys-1 (Dr. A): enc-a1 (turno 0 custo 0.05, turno 1 custo 0.03), enc-a2 (turno 0 custo 0.04) — modelo gpt-4o-mini
  //   phys-2 (sem nome cadastrado): enc-b1 (turno 0 custo 0.08) — modelo claude-haiku
  //   total = 0.20 | 4 interações | 3 casos
  describe('getCostReport', () => {
    function interactionRow(overrides: Record<string, unknown> = {}) {
      return {
        encounterId: 'enc-a1',
        model: 'gpt-4o-mini',
        cost: 0.05,
        latencyMs: 800,
        turnIndex: 0,
        createdAt: new Date('2025-06-10T10:00:00Z'),
        encounter: {
          physicianId: 'phys-1',
          physician: { name: 'Dr. A', email: 'a@example.com' },
        },
        ...overrides,
      };
    }

    function seedFixture() {
      prisma.aiInteraction.findMany.mockResolvedValue([
        interactionRow(), // enc-a1 turno 0 — 0.05
        interactionRow({
          encounterId: 'enc-a1',
          cost: 0.03,
          latencyMs: 700,
          turnIndex: 1,
        }), // enc-a1 turno 1 (reanálise) — 0.03
        interactionRow({
          encounterId: 'enc-a2',
          cost: 0.04,
          latencyMs: 900,
        }), // enc-a2 turno 0 — 0.04
        interactionRow({
          encounterId: 'enc-b1',
          model: 'claude-haiku',
          cost: 0.08,
          latencyMs: 1200,
          encounter: {
            physicianId: 'phys-2',
            physician: { name: null, email: 'b@example.com' },
          },
        }), // enc-b1 turno 0 — 0.08
      ]);
    }

    it('returns zeroed totals and empty breakdowns when there are no interactions in the period', async () => {
      prisma.aiInteraction.findMany.mockResolvedValue([]);

      const result = await service.getCostReport(30, 100);

      expect(result.totals).toEqual({
        totalCost: 0,
        interactionCount: 0,
        encounterCount: 0,
        avgCostPerCase: null,
        avgCostPerAnalysis: null,
        avgTurnsPerCase: null,
      });
      expect(result.byPhysician).toEqual([]);
      expect(result.byModel).toEqual([]);
      expect(result.byDay).toEqual([]);
      expect(result.projection).toEqual({
        projectedUsers: 100,
        avgCostPerPhysicianPerMonth: null,
        projectedMonthlyCost: null,
      });
    });

    it('sums total cost, interaction count and distinct encounter count', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      expect(result.totals.totalCost).toBeCloseTo(0.2, 2);
      expect(result.totals.interactionCount).toBe(4);
      expect(result.totals.encounterCount).toBe(3);
    });

    it('computes avgCostPerCase, avgCostPerAnalysis and avgTurnsPerCase', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      expect(result.totals.avgCostPerCase).toBeCloseTo(0.2 / 3, 2);
      expect(result.totals.avgCostPerAnalysis).toBeCloseTo(0.05, 2);
      expect(result.totals.avgTurnsPerCase).toBeCloseTo(4 / 3, 2);
    });

    it('breaks cost down by physician, distinguishing initial analyses from reanalysis turns', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      expect(result.byPhysician).toEqual([
        {
          physicianId: 'phys-1',
          name: 'Dr. A',
          email: 'a@example.com',
          totalCost: 0.12,
          analysesCount: 2, // enc-a1 turno 0 + enc-a2 turno 0
          reanalysisTurns: 1, // enc-a1 turno 1
          avgLatencyMs: 800, // (800+700+900)/3
        },
        {
          physicianId: 'phys-2',
          name: null,
          email: 'b@example.com',
          totalCost: 0.08,
          analysesCount: 1,
          reanalysisTurns: 0,
          avgLatencyMs: 1200,
        },
      ]);
    });

    it('sorts byPhysician by totalCost descending (highest spender first)', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      expect(result.byPhysician[0]!.physicianId).toBe('phys-1');
      expect(result.byPhysician[1]!.physicianId).toBe('phys-2');
    });

    it('breaks cost down by model', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      expect(result.byModel).toEqual([
        { model: 'gpt-4o-mini', totalCost: 0.12, count: 3, avgLatencyMs: 800 },
        { model: 'claude-haiku', totalCost: 0.08, count: 1, avgLatencyMs: 1200 },
      ]);
    });

    it('groups cost by day using the interaction createdAt date', async () => {
      prisma.aiInteraction.findMany.mockResolvedValue([
        interactionRow({ createdAt: new Date('2025-06-10T23:00:00Z'), cost: 0.05 }),
        interactionRow({ createdAt: new Date('2025-06-11T01:00:00Z'), cost: 0.02 }),
      ]);

      const result = await service.getCostReport(30, 100);

      expect(result.byDay).toEqual([
        { date: '2025-06-10', cost: 0.05 },
        { date: '2025-06-11', cost: 0.02 },
      ]);
    });

    it('projects monthly cost for N users from the average cost per physician, normalized to a 30-day month', async () => {
      seedFixture();

      // days=30 — sem normalização de escala, avgCostPerPhysicianPerMonth == avgCostPerPhysicianForPeriod.
      const result = await service.getCostReport(30, 100);

      const avgCostPerPhysician = 0.2 / 2; // 0.10 — 2 médicos distintos
      expect(result.projection.avgCostPerPhysicianPerMonth).toBeCloseTo(avgCostPerPhysician, 2);
      expect(result.projection.projectedMonthlyCost).toBeCloseTo(avgCostPerPhysician * 100, 2);
      expect(result.projection.projectedUsers).toBe(100);
    });

    it('scales the monthly projection when the period is not 30 days (a 7-day window is annualized to a month)', async () => {
      seedFixture();

      const result = await service.getCostReport(7, 100);

      const avgCostPerPhysicianForPeriod = 0.2 / 2; // 0.10 over 7 days
      const expectedMonthly = (avgCostPerPhysicianForPeriod / 7) * 30;
      expect(result.projection.avgCostPerPhysicianPerMonth).toBeCloseTo(expectedMonthly, 2);
    });

    it('respects a custom projectedUsers value', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 250);

      expect(result.projection.projectedUsers).toBe(250);
      expect(result.projection.projectedMonthlyCost).toBeCloseTo((0.2 / 2) * 250, 2);
    });

    it('always includes the cost-is-an-estimate disclaimer', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      expect(result.disclaimer).toMatch(/estimad|estimat/i);
    });

    it('includes the requested period window in the response', async () => {
      seedFixture();

      const result = await service.getCostReport(14, 100);

      expect(result.period.days).toBe(14);
      expect(result.period.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.period.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('never leaks patientRef or other patient-identifying fields (LGPD — this is professional usage data, not patient data)', async () => {
      seedFixture();

      const result = await service.getCostReport(30, 100);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('patientRef');
      expect(serialized).not.toContain('PRN-');
    });

    // PI-02 — critério de aceite: "Teste de performance com volume simulado de piloto".
    // Dezenas de médicos × dezenas de casos por dia é o volume esperado do piloto
    // controlado; milhares de interações no período é uma margem confortável acima disso.
    it('aggregates a pilot-scale volume of interactions well within a reasonable time budget', async () => {
      const physicianCount = 50;
      const interactionsPerPhysician = 40; // ~2000 interações no total
      const rows = [];
      for (let p = 0; p < physicianCount; p++) {
        for (let n = 0; n < interactionsPerPhysician; n++) {
          rows.push(
            interactionRow({
              encounterId: `enc-${p}-${Math.floor(n / 3)}`,
              model: n % 2 === 0 ? 'gpt-4o-mini' : 'claude-haiku',
              cost: 0.01 + (n % 5) * 0.001,
              latencyMs: 600 + (n % 10) * 10,
              turnIndex: n % 3,
              createdAt: new Date(2025, 5, 1 + (n % 28)),
              encounter: {
                physicianId: `phys-${p}`,
                physician: { name: `Dr. ${p}`, email: `phys${p}@example.com` },
              },
            }),
          );
        }
      }
      prisma.aiInteraction.findMany.mockResolvedValue(rows);

      const start = Date.now();
      const result = await service.getCostReport(30, 100);
      const elapsedMs = Date.now() - start;

      expect(result.totals.interactionCount).toBe(physicianCount * interactionsPerPhysician);
      expect(result.byPhysician).toHaveLength(physicianCount);
      expect(elapsedMs).toBeLessThan(1000);
    });
  });
});
