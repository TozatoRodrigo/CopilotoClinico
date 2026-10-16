import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AudioRetentionService,
  AUDIO_RETENTION_PAGE_SIZE,
  AUDIO_RETENTION_PURGE_ACTION,
} from './audio-retention.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';

const NOW = new Date('2026-10-10T12:00:00.000Z');

function capture(n: number) {
  const suffix = String(n).padStart(12, '0');
  return {
    id: `00000000-0000-0000-0000-${suffix}`,
    encounterId: `11111111-0000-0000-0000-${suffix}`,
    physicianId: '22222222-0000-0000-0000-000000000001',
  };
}

describe('AudioRetentionService', () => {
  let service: AudioRetentionService;
  let tx: { audioCapture: { updateMany: ReturnType<typeof vi.fn> } };
  let prisma: {
    audioCapture: { findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let audit: { logInTransaction: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    tx = { audioCapture: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    prisma = {
      audioCapture: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    audit = { logInTransaction: vi.fn().mockResolvedValue(undefined) };

    service = new AudioRetentionService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    logger = service['logger'] as unknown as typeof logger;
    logger.error = vi.fn();
  });

  it('selects only expired captures that still hold audio', async () => {
    await service.purgeExpired(NOW);

    expect(prisma.audioCapture.findMany).toHaveBeenCalledWith({
      where: { retainUntil: { lt: NOW }, status: { not: 'deleted' } },
      orderBy: { id: 'asc' },
      take: AUDIO_RETENTION_PAGE_SIZE,
      select: { id: true, encounterId: true, physicianId: true },
    });
  });

  it('does nothing when no capture is expired', async () => {
    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({ purged: 0, failed: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('clears the audio and marks the capture deleted with a conditional update', async () => {
    prisma.audioCapture.findMany.mockResolvedValueOnce([capture(1)]);

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({ purged: 1, failed: 0 });
    expect(tx.audioCapture.updateMany).toHaveBeenCalledWith({
      where: { id: capture(1).id, retainUntil: { lt: NOW }, status: { not: 'deleted' } },
      data: { encryptedContent: null, status: 'deleted' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
  });

  it('records the purge in the audit trail inside the same transaction, with ids only', async () => {
    prisma.audioCapture.findMany.mockResolvedValueOnce([capture(1)]);

    await service.purgeExpired(NOW);

    expect(audit.logInTransaction).toHaveBeenCalledOnce();
    const [client, params] = audit.logInTransaction.mock.calls[0] as [
      unknown,
      { actorId: string; action: string; entity: string; entityId: string; payload: object },
    ];
    expect(client).toBe(tx);
    expect(params).toEqual({
      actorId: 'system',
      action: AUDIO_RETENTION_PURGE_ACTION,
      entity: 'AudioCapture',
      entityId: capture(1).id,
      payload: { encounterId: capture(1).encounterId, physicianId: capture(1).physicianId },
    });
    expect(tx.audioCapture.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      audit.logInTransaction.mock.invocationCallOrder[0]!,
    );
  });

  it('skips the audit entry when a concurrent run already purged the capture', async () => {
    prisma.audioCapture.findMany.mockResolvedValueOnce([capture(1), capture(2)]);
    tx.audioCapture.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({ purged: 1, failed: 0 });
    expect(audit.logInTransaction).toHaveBeenCalledOnce();
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ entityId: capture(2).id }),
    );
  });

  it('keeps purging after one capture fails and reports the failure', async () => {
    prisma.audioCapture.findMany.mockResolvedValueOnce([capture(1), capture(2), capture(3)]);
    prisma.$transaction.mockRejectedValueOnce(new Error('could not obtain lock'));

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({ purged: 2, failed: 1 });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      `Audio retention purge failed for capture ${capture(1).id}: could not obtain lock`,
      expect.any(String),
    );
  });

  it('pages through the backlog by id cursor', async () => {
    const firstPage = Array.from({ length: AUDIO_RETENTION_PAGE_SIZE }, (_, i) => capture(i + 1));
    const secondPage = [capture(AUDIO_RETENTION_PAGE_SIZE + 1)];
    prisma.audioCapture.findMany.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({ purged: AUDIO_RETENTION_PAGE_SIZE + 1, failed: 0 });
    expect(prisma.audioCapture.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.audioCapture.findMany.mock.calls[1]![0]).toMatchObject({
      where: { id: { gt: firstPage.at(-1)!.id } },
    });
  });

  it('terminates when a full page fails, instead of re-reading the same captures', async () => {
    const page = Array.from({ length: AUDIO_RETENTION_PAGE_SIZE }, (_, i) => capture(i + 1));
    // Sem cursor, as mesmas capturas voltariam para sempre (continuam elegíveis).
    prisma.audioCapture.findMany.mockImplementation(
      async (args: { where: { id?: { gt: string } } }) => (args.where.id ? [] : page),
    );
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    const result = await service.purgeExpired(NOW);

    expect(result).toEqual({ purged: 0, failed: AUDIO_RETENTION_PAGE_SIZE });
    expect(prisma.audioCapture.findMany).toHaveBeenCalledTimes(2);
  });
});
