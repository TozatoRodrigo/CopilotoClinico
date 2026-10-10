import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { backfillCopilotFeedback } from './copilot-feedback-backfill';

const physicianId = '11111111-1111-4111-8111-111111111111';
const encounterId = '22222222-2222-4222-8222-222222222222';
const interactionId = '33333333-3333-4333-8333-333333333333';

function auditEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    actorId: physicianId,
    entityId: interactionId,
    payload: { encounterId, kind: 'wrong_scenario', comment: 'Era dengue' },
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    ...overrides,
  };
}

const AUDIT_1 = 'aaaaaaa1-0000-4000-8000-000000000001';
const AUDIT_2 = 'aaaaaaa1-0000-4000-8000-000000000002';
const AUDIT_3 = 'aaaaaaa1-0000-4000-8000-000000000003';

describe('backfillCopilotFeedback (F0-D)', () => {
  let prisma: {
    auditLog: { findMany: ReturnType<typeof vi.fn> };
    aiInteraction: { findMany: ReturnType<typeof vi.fn> };
    copilotFeedback: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  };

  function run(apply: boolean, batchSize?: number) {
    return backfillCopilotFeedback(prisma as unknown as PrismaClient, { apply, batchSize });
  }

  beforeEach(() => {
    prisma = {
      auditLog: { findMany: vi.fn().mockResolvedValue([]) },
      aiInteraction: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: interactionId, encounterId, encounter: { physicianId } }]),
      },
      copilotFeedback: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi
          .fn()
          .mockImplementation(({ data }: { data: unknown[] }) =>
            Promise.resolve({ count: data.length }),
          ),
      },
    };
  });

  it('imports COPILOT_FEEDBACK entries with a masked comment, linked to the audit entry', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([
      auditEntry(AUDIT_1, {
        payload: {
          encounterId,
          kind: 'missing_coverage',
          comment: 'CPF 529.982.247-25, era dengue',
        },
      }),
    ]);

    const report = await run(true);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'COPILOT_FEEDBACK' } }),
    );
    expect(prisma.copilotFeedback.createMany).toHaveBeenCalledWith({
      data: [
        {
          auditLogId: AUDIT_1,
          interactionId,
          encounterId,
          physicianId,
          kind: 'missing_coverage',
          comment: 'CPF [REDACTED_CPF], era dengue',
          createdAt: new Date('2026-09-20T10:00:00.000Z'),
        },
      ],
      skipDuplicates: true,
    });
    expect(report).toEqual({
      applied: true,
      scanned: 1,
      alreadyImported: 0,
      imported: 1,
      skippedInvalidPayload: 0,
      skippedMissingAnalysis: 0,
    });
  });

  it('is idempotent: entries already in the queue are skipped', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([auditEntry(AUDIT_1), auditEntry(AUDIT_2)]);
    prisma.copilotFeedback.findMany.mockResolvedValue([{ auditLogId: AUDIT_1 }]);

    const report = await run(true);

    const created = prisma.copilotFeedback.createMany.mock.calls[0]![0] as {
      data: Array<{ auditLogId: string }>;
    };
    expect(created.data.map((row) => row.auditLogId)).toEqual([AUDIT_2]);
    expect(report.alreadyImported).toBe(1);
    expect(report.imported).toBe(1);
  });

  it('only counts in dry-run mode, writing nothing', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([auditEntry(AUDIT_1)]);

    const report = await run(false);

    expect(prisma.copilotFeedback.createMany).not.toHaveBeenCalled();
    expect(report).toMatchObject({ applied: false, imported: 1 });
  });

  it('skips entries whose analysis no longer exists (encounter erased under LGPD)', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([auditEntry(AUDIT_1)]);
    prisma.aiInteraction.findMany.mockResolvedValue([]);

    const report = await run(true);

    expect(prisma.copilotFeedback.createMany).not.toHaveBeenCalled();
    expect(report.skippedMissingAnalysis).toBe(1);
  });

  it('skips entries whose payload does not match the analysis owner', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([
      auditEntry(AUDIT_1, { actorId: '99999999-9999-4999-8999-999999999999' }),
    ]);

    const report = await run(true);

    expect(report.skippedMissingAnalysis).toBe(1);
    expect(prisma.copilotFeedback.createMany).not.toHaveBeenCalled();
  });

  it('skips malformed entries without querying analyses with invalid ids', async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([
      auditEntry(AUDIT_1, { payload: { kind: 'wrong_scenario' } }),
      auditEntry(AUDIT_2, { payload: { encounterId, kind: 'unknown_kind' } }),
      auditEntry(AUDIT_3, { entityId: 'not-a-uuid' }),
    ]);

    const report = await run(true);

    expect(report.skippedInvalidPayload).toBe(3);
    expect(prisma.aiInteraction.findMany).not.toHaveBeenCalled();
  });

  it('walks the audit trail in batches with a cursor', async () => {
    prisma.auditLog.findMany
      .mockResolvedValueOnce([auditEntry(AUDIT_1), auditEntry(AUDIT_2)])
      .mockResolvedValueOnce([auditEntry(AUDIT_3)]);

    const report = await run(true, 2);

    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.findMany.mock.calls[1]![0]).toMatchObject({
      cursor: { id: AUDIT_2 },
      skip: 1,
      take: 2,
    });
    expect(report.scanned).toBe(3);
    expect(report.imported).toBe(3);
  });
});
