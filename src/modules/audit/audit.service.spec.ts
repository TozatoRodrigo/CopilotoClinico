import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService } from './audit.service';
import { PrismaService } from '../../config/prisma.service';
import { createHash } from 'crypto';

const actorId = '550e8400-e29b-41d4-a716-446655440000';
const entityId = '770e8400-e29b-41d4-a716-446655440002';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    actorId,
    action: 'create',
    entity: 'encounter',
    entityId,
    beforeHash: null as string | null,
    afterHash: 'hash-1',
    payload: null,
    ip: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      auditLog: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new AuditService(prisma as unknown as PrismaService);
  });

  describe('log', () => {
    it('creates first entry with no beforeHash when no prior entries exist', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(
        makeEntry({ beforeHash: null, afterHash: expect.any(String) }),
      );

      const result = await service.log({
        actorId,
        action: 'create',
        entity: 'encounter',
        entityId,
      });

      expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        select: { afterHash: true },
      });
      expect(result.beforeHash).toBeNull();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId,
            action: 'create',
            entity: 'encounter',
            entityId,
            afterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
    });

    it('computes beforeHash from previous entry afterHash', async () => {
      const firstEntry = makeEntry({ afterHash: 'a'.repeat(64) });
      prisma.auditLog.findFirst.mockResolvedValue(firstEntry);
      prisma.auditLog.create.mockResolvedValue(
        makeEntry({
          id: 'audit-2',
          beforeHash: expect.any(String),
          afterHash: 'b'.repeat(64),
        }),
      );

      await service.log({
        actorId,
        action: 'update',
        entity: 'encounter',
        entityId,
      });

      const createArgs = prisma.auditLog.create.mock.calls as unknown as Array<
        [{ data: { beforeHash: string | null } }]
      >;
      expect(createArgs[0]![0].data.beforeHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces a hash chain across multiple entries', async () => {
      const firstAfterHash = 'a'.repeat(64);
      const firstEntry = makeEntry({ afterHash: firstAfterHash });
      prisma.auditLog.findFirst.mockResolvedValueOnce(firstEntry);

      const fixedDate = new Date('2025-06-01T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      const secondAfterData = {
        actorId,
        action: 'update',
        entity: 'encounter',
        entityId,
        payload: null,
        timestamp: fixedDate.toISOString(),
      };
      const expectedBeforeHash = createHash('sha256')
        .update(firstAfterHash + JSON.stringify(secondAfterData))
        .digest('hex');

      let secondEntry: Record<string, unknown>;
      prisma.auditLog.create.mockImplementation((args: { data: Record<string, unknown> }) => {
        secondEntry = {
          id: 'audit-2',
          actorId: args.data.actorId,
          action: args.data.action,
          entity: args.data.entity,
          entityId: args.data.entityId,
          beforeHash: args.data.beforeHash,
          afterHash: args.data.afterHash,
          payload: args.data.payload,
          ip: args.data.ip,
          createdAt: new Date(),
        };
        return Promise.resolve(secondEntry);
      });

      const result = await service.log({
        actorId,
        action: 'update',
        entity: 'encounter',
        entityId,
      });

      vi.useRealTimers();

      expect(result.beforeHash).toBe(expectedBeforeHash);
      expect(result.afterHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.beforeHash).not.toBe(result.afterHash);
    });

    it('stores payload and ip when provided', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(
        makeEntry({
          payload: { key: 'value' },
          ip: '192.168.1.1',
        }),
      );

      await service.log({
        actorId,
        action: 'create',
        entity: 'document',
        entityId,
        payload: { key: 'value' },
        ip: '192.168.1.1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: { key: 'value' },
            ip: '192.168.1.1',
          }),
        }),
      );
    });

    it('computes afterHash deterministically from entry data', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const fixedDate = new Date('2025-06-01T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedDate);

      let capturedAfterHash: string | undefined;
      prisma.auditLog.create.mockImplementation((args: { data: { afterHash: string } }) => {
        capturedAfterHash = args.data.afterHash;
        return Promise.resolve(makeEntry({ afterHash: capturedAfterHash }));
      });

      await service.log({
        actorId,
        action: 'create',
        entity: 'encounter',
        entityId,
        payload: { foo: 'bar' },
      });

      vi.useRealTimers();

      const expectedData = {
        actorId,
        action: 'create',
        entity: 'encounter',
        entityId,
        payload: { foo: 'bar' },
        timestamp: fixedDate.toISOString(),
      };
      const expectedHash = createHash('sha256')
        .update(JSON.stringify(expectedData))
        .digest('hex');

      expect(capturedAfterHash).toBe(expectedHash);
    });
  });

  describe('query', () => {
    it('returns paginated results with total count', async () => {
      const items = [makeEntry()];
      prisma.auditLog.findMany.mockResolvedValue(items);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.query({
        limit: 50,
        offset: 0,
      });

      expect(result).toEqual({ items, total: 1 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('filters by entity and entityId', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.query({
        entity: 'encounter',
        entityId,
        limit: 50,
        offset: 0,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity: 'encounter',
            entityId,
          }),
        }),
      );
    });

    it('filters by actorId', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.query({
        actorId,
        limit: 50,
        offset: 0,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ actorId }),
        }),
      );
    });

    it('filters by date range', async () => {
      const from = new Date('2025-01-01');
      const to = new Date('2025-12-31');
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.query({
        from,
        to,
        limit: 50,
        offset: 0,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('respects limit and offset for pagination', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(100);

      await service.query({
        limit: 10,
        offset: 20,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });
});
