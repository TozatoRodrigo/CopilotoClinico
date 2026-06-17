import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductFunnelService } from './product-funnel.service';
import { PrismaService } from '../../config/prisma.service';

describe('ProductFunnelService', () => {
  let service: ProductFunnelService;
  let prisma: {
    aiInteraction: { findMany: ReturnType<typeof vi.fn> };
    document: { findMany: ReturnType<typeof vi.fn> };
    physician: { count: ReturnType<typeof vi.fn> };
    encounter: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      aiInteraction: { findMany: vi.fn().mockResolvedValue([]) },
      document: { findMany: vi.fn().mockResolvedValue([]) },
      physician: { count: vi.fn().mockResolvedValue(0) },
      encounter: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new ProductFunnelService(prisma as unknown as PrismaService);
  });

  describe('getDecisionLoopFunnel', () => {
    it('returns an empty funnel when there are no analyses in the window', async () => {
      prisma.aiInteraction.findMany.mockResolvedValue([]);

      const result = await service.getDecisionLoopFunnel(new Date(), null);

      expect(result.analysesStarted).toBe(0);
      expect(result.abandonmentRate).toBe(0);
      expect(result.avgTurnsToConduta).toBeNull();
    });

    it('computes blocker answer rate, turns-to-conduta and abandonment', async () => {
      // Two encounters started an analysis.
      prisma.aiInteraction.findMany
        // 1st call: roots (turn-0 / parentless interactions).
        .mockResolvedValueOnce([{ encounterId: 'e1' }, { encounterId: 'e2' }])
        // 2nd call: every interaction for those encounters.
        .mockResolvedValueOnce([
          {
            encounterId: 'e1',
            turnIndex: 0,
            uncertainty: false,
            rawOutput: {
              clarifyingQuestions: [
                { id: 'q1', criticality: 'blocker' },
                { id: 'q2', criticality: 'important' },
              ],
            },
            answeredQuestions: [],
          },
          {
            encounterId: 'e1',
            turnIndex: 1,
            uncertainty: false,
            rawOutput: { clarifyingQuestions: [] }, // loop closed
            answeredQuestions: [{ questionId: 'q1' }, { questionId: 'q2' }],
          },
          {
            encounterId: 'e2',
            turnIndex: 0,
            uncertainty: true,
            rawOutput: { clarifyingQuestions: [{ id: 'q3', criticality: 'blocker' }] },
            answeredQuestions: [],
          },
        ]);
      // Only e1 confirmed a document.
      prisma.document.findMany.mockResolvedValue([{ encounterId: 'e1' }]);

      const result = await service.getDecisionLoopFunnel(new Date(), null);

      expect(result.analysesStarted).toBe(2);
      expect(result.encountersWithBlockers).toBe(2);
      expect(result.blockerQuestionsEmitted).toBe(2); // q1 + q3
      expect(result.blockerQuestionsAnswered).toBe(1); // only q1
      expect(result.blockerAnswerRate).toBe(0.5);
      expect(result.reachedConduta).toBe(1);
      expect(result.avgTurnsToConduta).toBe(2); // e1: maxTurn 1 -> 2 turns
      expect(result.abandoned).toBe(1); // e2: blocker, not closed, not confirmed
      expect(result.abandonmentRate).toBe(0.5);
      expect(result.confirmedDocuments).toBe(1);
      expect(result.uncertaintyRate).toBe(round3(1 / 3));
    });

    it('threads the demoCase segment into the roots query (caso-norte)', async () => {
      prisma.aiInteraction.findMany.mockResolvedValue([]);

      await service.getDecisionLoopFunnel(new Date(), 'gripal');

      const rootsCall = prisma.aiInteraction.findMany.mock.calls[0]![0] as {
        where: { params?: { path: string[]; equals: string } };
      };
      expect(rootsCall.where.params).toEqual({ path: ['demoCase'], equals: 'gripal' });
    });

    it('does not filter by params when no demoCase is requested', async () => {
      prisma.aiInteraction.findMany.mockResolvedValue([]);

      await service.getDecisionLoopFunnel(new Date(), null);

      const rootsCall = prisma.aiInteraction.findMany.mock.calls[0]![0] as {
        where: { params?: unknown };
      };
      expect(rootsCall.where.params).toBeUndefined();
    });

    it('is LGPD-safe — exposes only counts, ratios and durations', async () => {
      prisma.aiInteraction.findMany
        .mockResolvedValueOnce([{ encounterId: 'e1' }])
        .mockResolvedValueOnce([
          {
            encounterId: 'e1',
            turnIndex: 0,
            uncertainty: false,
            rawOutput: { clarifyingQuestions: [{ id: 'q1', criticality: 'blocker' }] },
            answeredQuestions: [],
          },
        ]);

      const result = await service.getDecisionLoopFunnel(new Date(), null);
      const json = JSON.stringify(result);

      // No clinical content or identifiers leak into the funnel payload.
      expect(json).not.toContain('caseText');
      expect(json).not.toContain('patientRef');
      expect(json).not.toContain('recommendations');
      expect(json).not.toContain('answer');
      for (const key of [
        'analysesStarted',
        'encountersWithBlockers',
        'blockerQuestionsEmitted',
        'blockerQuestionsAnswered',
        'blockerAnswerRate',
        'reachedConduta',
        'avgTurnsToConduta',
        'abandoned',
        'abandonmentRate',
        'confirmedDocuments',
        'uncertaintyRate',
      ]) {
        expect(result).toHaveProperty(key);
      }
    });
  });

  describe('getActivationFunnel', () => {
    it('counts distinct physicians across each activation step', async () => {
      prisma.physician.count.mockResolvedValue(10);
      prisma.encounter.findMany.mockResolvedValue([{ physicianId: 'p1' }, { physicianId: 'p2' }]);
      prisma.aiInteraction.findMany.mockResolvedValue([
        { encounter: { physicianId: 'p1' } },
        { encounter: { physicianId: 'p1' } },
        { encounter: { physicianId: 'p3' } },
      ]);
      prisma.document.findMany.mockResolvedValue([{ confirmedBy: 'p1' }]);

      const result = await service.getActivationFunnel(new Date());

      expect(result).toEqual({
        registered: 10,
        withEncounter: 2,
        withAnalysis: 2, // distinct p1, p3
        withConfirmation: 1, // p1
      });
    });
  });

  describe('getFunnel', () => {
    it('clamps the window and surfaces the demoCase segment', async () => {
      const result = await service.getFunnel({ days: 9999, demoCase: 'gripal' });

      expect(result.period).toBe('last365days');
      expect(result.demoCase).toBe('gripal');
    });
  });
});

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
