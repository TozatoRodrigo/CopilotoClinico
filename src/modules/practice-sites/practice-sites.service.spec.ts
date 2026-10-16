import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PracticeSiteInput } from '../../shared/contracts/practice-site';
import { PracticeSitesService } from './practice-sites.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const otherSiteId = '33333333-3333-4333-8333-333333333333';
const createdAt = new Date('2026-10-14T10:00:00.000Z');

const upaInput: PracticeSiteInput = {
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  hasCT: false,
  hasLab: true,
  hasICU: false,
  isSus: true,
  specialists: [],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 60,
  isDefault: false,
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: siteId,
    ...upaInput,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('PracticeSitesService', () => {
  let service: PracticeSitesService;
  let prisma: {
    practiceSite: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = {
      practiceSite: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(record()),
        count: vi.fn().mockResolvedValue(0),
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(record({ ...data, physicianId: undefined })),
          ),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve(record(data))),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue(record()),
      },
      $transaction: vi.fn(),
    };
    // O serviço recebe o próprio mock como cliente da transação.
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new PracticeSitesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('lists only the physician sites, the default first, with ISO dates', async () => {
      prisma.practiceSite.findMany.mockResolvedValue([record({ isDefault: true })]);

      const sites = await service.list(physicianId);

      expect(prisma.practiceSite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { physicianId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        }),
      );
      expect(sites).toEqual([
        expect.objectContaining({
          id: siteId,
          name: 'UPA Centro',
          isDefault: true,
          createdAt: createdAt.toISOString(),
        }),
      ]);
    });

    it('turns a stored value that left the lists into "outro" and drops unknown specialists', async () => {
      prisma.practiceSite.findMany.mockResolvedValue([
        record({ facilityType: 'upa_porte_4', specialists: ['neurologia', 'astrologia'] }),
      ]);

      const [site] = await service.list(physicianId);

      expect(site?.facilityType).toBe('outro');
      expect(site?.specialists).toEqual(['neurologia']);
    });
  });

  describe('create', () => {
    it('makes the first site the default even when the form did not ask', async () => {
      prisma.practiceSite.count.mockResolvedValue(0);

      const site = await service.create(physicianId, upaInput);

      expect(prisma.practiceSite.updateMany).toHaveBeenCalledWith({
        where: { physicianId, isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.practiceSite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ...upaInput, physicianId, isDefault: true },
        }),
      );
      expect(site.isDefault).toBe(true);
    });

    it('keeps the current default when a second site is saved without asking for it', async () => {
      prisma.practiceSite.count.mockResolvedValue(1);

      const site = await service.create(physicianId, upaInput);

      expect(prisma.practiceSite.updateMany).not.toHaveBeenCalled();
      expect(site.isDefault).toBe(false);
    });

    it('moves the default when the new site asks for it', async () => {
      prisma.practiceSite.count.mockResolvedValue(2);

      await service.create(physicianId, { ...upaInput, isDefault: true });

      expect(prisma.practiceSite.updateMany).toHaveBeenCalledWith({
        where: { physicianId, isDefault: true },
        data: { isDefault: false },
      });
    });

    it('refuses an 11th site', async () => {
      prisma.practiceSite.count.mockResolvedValue(10);

      await expect(service.create(physicianId, upaInput)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.practiceSite.create).not.toHaveBeenCalled();
    });

    it('audits without the free-text name', async () => {
      await service.create(physicianId, upaInput);

      expect(audit.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'PRACTICE_SITE_CREATED',
        entity: 'PracticeSite',
        entityId: siteId,
        payload: { facilityType: 'upa_porte_1', isDefault: true },
      });
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('UPA Centro');
    });

    it('still returns the saved site when the audit trail fails', async () => {
      audit.log.mockRejectedValue(new Error('chain busy'));

      await expect(service.create(physicianId, upaInput)).resolves.toMatchObject({ id: siteId });
    });
  });

  describe('update', () => {
    it('answers 404 for a site of another physician (same as a missing one)', async () => {
      prisma.practiceSite.findFirst.mockResolvedValue(null);

      await expect(service.update(physicianId, otherSiteId, upaInput)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.practiceSite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: otherSiteId, physicianId } }),
      );
      expect(prisma.practiceSite.update).not.toHaveBeenCalled();
    });

    it('moves the default to the edited site when asked', async () => {
      prisma.practiceSite.findFirst.mockResolvedValue(record({ isDefault: false }));

      const site = await service.update(physicianId, siteId, { ...upaInput, isDefault: true });

      expect(prisma.practiceSite.updateMany).toHaveBeenCalledOnce();
      expect(site.isDefault).toBe(true);
    });

    it('keeps the default when the form unchecks it on the default site', async () => {
      prisma.practiceSite.findFirst.mockResolvedValue(record({ isDefault: true }));

      const site = await service.update(physicianId, siteId, {
        ...upaInput,
        hasCT: true,
        isDefault: false,
      });

      expect(prisma.practiceSite.updateMany).not.toHaveBeenCalled();
      expect(prisma.practiceSite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: siteId },
          data: { ...upaInput, hasCT: true, isDefault: true },
        }),
      );
      expect(site.isDefault).toBe(true);
    });
  });

  describe('remove', () => {
    it('promotes the oldest remaining site when the default is deleted', async () => {
      prisma.practiceSite.findFirst
        .mockResolvedValueOnce(record({ isDefault: true }))
        .mockResolvedValueOnce({ id: otherSiteId });

      await service.remove(physicianId, siteId);

      expect(prisma.practiceSite.delete).toHaveBeenCalledWith({ where: { id: siteId } });
      expect(prisma.practiceSite.findFirst).toHaveBeenLastCalledWith({
        where: { physicianId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      expect(prisma.practiceSite.update).toHaveBeenCalledWith({
        where: { id: otherSiteId },
        data: { isDefault: true },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRACTICE_SITE_DELETED', entityId: siteId }),
      );
    });

    it('leaves no default when the last site is deleted', async () => {
      prisma.practiceSite.findFirst
        .mockResolvedValueOnce(record({ isDefault: true }))
        .mockResolvedValueOnce(null);

      await service.remove(physicianId, siteId);

      expect(prisma.practiceSite.update).not.toHaveBeenCalled();
    });

    it('does not touch the default when another site is deleted', async () => {
      prisma.practiceSite.findFirst.mockResolvedValueOnce(record({ isDefault: false }));

      await service.remove(physicianId, siteId);

      expect(prisma.practiceSite.findFirst).toHaveBeenCalledOnce();
      expect(prisma.practiceSite.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing site', async () => {
      prisma.practiceSite.findFirst.mockResolvedValue(null);

      await expect(service.remove(physicianId, siteId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.practiceSite.delete).not.toHaveBeenCalled();
    });
  });
});
