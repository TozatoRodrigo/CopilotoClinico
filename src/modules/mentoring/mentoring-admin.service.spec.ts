import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../config/prisma.service';
import { MentoringAdminService, percentile, summarizeMentoring } from './mentoring-admin.service';

const at = (iso: string) => new Date(iso);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    status: 'answered' as const,
    createdAt: at('2026-10-14T10:00:00.000Z'),
    claimedAt: null,
    answeredAt: null as Date | null,
    cancelledAt: null,
    satisfaction: null as number | null,
    termsVersion: '2026-10-14-provisorio',
    requesterId: 'dr-a',
    requester: { name: 'Dra. A' },
    mentor: null as { name: string | null } | null,
    institution: null as { name: string } | null,
    ...overrides,
  };
}

describe('summarizeMentoring', () => {
  it('computes requests per active physician, response time and satisfaction', () => {
    const rows = [
      row({ answeredAt: at('2026-10-14T10:30:00.000Z'), satisfaction: 5 }),
      row({ id: 'req-2', answeredAt: at('2026-10-14T12:00:00.000Z'), satisfaction: 3 }),
      row({ id: 'req-3', status: 'pending', requesterId: 'dr-b' }),
      row({ id: 'req-4', status: 'cancelled', requesterId: 'dr-b' }),
    ];

    expect(summarizeMentoring(rows, 8, 30)).toEqual({
      periodDays: 30,
      total: 4,
      byStatus: { pending: 1, claimed: 0, answered: 2, cancelled: 1 },
      requesters: 2,
      activePhysicians: 8,
      requestsPerActivePhysician: 0.5,
      responseMinutes: { median: 30, p90: 120 },
      satisfaction: { average: 4, rated: 2, distribution: [0, 0, 1, 0, 1] },
    });
  });

  it('reports null instead of zero when there is nothing to measure', () => {
    const metrics = summarizeMentoring([], 0, 7);
    expect(metrics.requestsPerActivePhysician).toBeNull();
    expect(metrics.responseMinutes).toEqual({ median: null, p90: null });
    expect(metrics.satisfaction).toEqual({
      average: null,
      rated: 0,
      distribution: [0, 0, 0, 0, 0],
    });
  });
});

describe('percentile', () => {
  it('uses the nearest rank', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.9)).toBe(40);
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('MentoringAdminService.overview', () => {
  it('returns metadata only — no case, question or answer text', async () => {
    const prisma = {
      mentoringRequest: {
        findMany: vi.fn().mockResolvedValue([
          row({
            answeredAt: at('2026-10-14T10:45:00.000Z'),
            satisfaction: 4,
            mentor: { name: 'Dr. Ripardo' },
            institution: { name: 'Hospital A' },
          }),
        ]),
      },
      encounter: { findMany: vi.fn().mockResolvedValue([{ physicianId: 'dr-a' }]) },
    };
    const service = new MentoringAdminService(prisma as unknown as PrismaService);

    const result = await service.overview({ days: 30 });

    expect(result.items).toEqual([
      {
        id: 'req-1',
        status: 'answered',
        createdAt: '2026-10-14T10:00:00.000Z',
        claimedAt: null,
        answeredAt: '2026-10-14T10:45:00.000Z',
        cancelledAt: null,
        responseMinutes: 45,
        satisfaction: 4,
        requesterName: 'Dra. A',
        mentorName: 'Dr. Ripardo',
        institutionName: 'Hospital A',
        termsVersion: '2026-10-14-provisorio',
      },
    ]);
    expect(result.metrics.requestsPerActivePhysician).toBe(1);

    const select = prisma.mentoringRequest.findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty('caseSnapshot');
    expect(select).not.toHaveProperty('question');
    expect(select).not.toHaveProperty('answer');
    // "Médico ativo" = ao menos uma análise no período.
    expect(prisma.encounter.findMany).toHaveBeenCalledWith({
      where: { aiInteractions: { some: { createdAt: { gte: expect.any(Date) } } } },
      distinct: ['physicianId'],
      select: { physicianId: true },
    });
  });
});
