import { describe, it, expect, vi } from 'vitest';
import { BackupHealthService } from './backup-health.service';
import { PrismaService } from '../../config/prisma.service';

function buildMocks() {
  const prisma = {
    $queryRaw: vi.fn(),
  } as unknown as PrismaService;

  const service = new BackupHealthService(prisma);
  return { service, prisma };
}

describe('BackupHealthService.check', () => {
  it('returns healthy=true when DB is accessible', async () => {
    const { service, prisma } = buildMocks();

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ '?column?': 1 }]) // ping
      .mockResolvedValueOnce([{ count: BigInt(10) }]) // physicians
      .mockResolvedValueOnce([{ count: BigInt(25) }]) // encounters
      .mockResolvedValueOnce([{ count: BigInt(100) }]); // audit_log

    const result = await service.check();

    expect(result.healthy).toBe(true);
    expect(result.dbPingMs).toBeGreaterThanOrEqual(0);
    expect(result.tableCounts.physicians).toBe(10);
    expect(result.tableCounts.encounters).toBe(25);
    expect(result.tableCounts.audit_log).toBe(100);
    expect(result.message).toContain('healthy');
  });

  it('returns healthy=false when DB ping fails', async () => {
    const { service, prisma } = buildMocks();

    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
      new Error('connection refused'),
    );

    const result = await service.check();

    expect(result.healthy).toBe(false);
    expect(result.message).toContain('connection refused');
    expect(result.tableCounts).toEqual({});
  });

  it('includes checkedAt timestamp', async () => {
    const { service, prisma } = buildMocks();
    const before = new Date();

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);

    const result = await service.check();
    const after = new Date();

    expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
