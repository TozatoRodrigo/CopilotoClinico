import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InstitutionsService } from './institutions.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';

const institutionId = '880e8400-e29b-41d4-a716-446655440003';
const physicianId = '550e8400-e29b-41d4-a716-446655440000';

describe('InstitutionsService', () => {
  let service: InstitutionsService;
  let prisma: {
    institution: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    physician: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    physicianInstitution: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let auditService: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      institution: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      physician: {
        findUnique: vi.fn(),
      },
      physicianInstitution: {
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
    };

    auditService = { log: vi.fn().mockResolvedValue(undefined) };

    service = new InstitutionsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('creates an institution and audits the action', async () => {
      prisma.institution.create.mockResolvedValue({
        id: institutionId,
        name: 'Hospital Central',
        cnes: '1234567',
        status: 'active',
      });

      const result = await service.create({
        name: 'Hospital Central',
        cnes: '1234567',
        status: 'active',
      });

      expect(prisma.institution.create).toHaveBeenCalledWith({
        data: { name: 'Hospital Central', cnes: '1234567', status: 'active' },
      });
      expect(result.id).toBe(institutionId);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INSTITUTION_CREATED',
          entityId: institutionId,
          payload: { name: 'Hospital Central', cnes: '1234567' },
        }),
      );
    });

    it('defaults cnes to null when not provided', async () => {
      prisma.institution.create.mockResolvedValue({
        id: institutionId,
        name: 'Hospital Central',
        cnes: null,
        status: 'active',
      });

      await service.create({ name: 'Hospital Central', status: 'active' });

      expect(prisma.institution.create).toHaveBeenCalledWith({
        data: { name: 'Hospital Central', cnes: null, status: 'active' },
      });
    });
  });

  describe('findAll', () => {
    it('returns institutions ordered by name', async () => {
      prisma.institution.findMany.mockResolvedValue([{ id: institutionId, name: 'Hospital Central' }]);

      const result = await service.findAll();

      expect(prisma.institution.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
      expect(result).toHaveLength(1);
    });
  });

  describe('linkPhysician', () => {
    it('throws NotFoundException when the institution does not exist', async () => {
      prisma.institution.findUnique.mockResolvedValue(null);

      await expect(service.linkPhysician(institutionId, physicianId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.physicianInstitution.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the physician does not exist', async () => {
      prisma.institution.findUnique.mockResolvedValue({ id: institutionId });
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.linkPhysician(institutionId, physicianId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.physicianInstitution.upsert).not.toHaveBeenCalled();
    });

    it('upserts the link idempotently and audits the action', async () => {
      prisma.institution.findUnique.mockResolvedValue({ id: institutionId });
      prisma.physician.findUnique.mockResolvedValue({ id: physicianId });
      prisma.physicianInstitution.upsert.mockResolvedValue({
        id: 'link-1',
        physicianId,
        institutionId,
      });

      const result = await service.linkPhysician(institutionId, physicianId);

      expect(prisma.physicianInstitution.upsert).toHaveBeenCalledWith({
        where: { physicianId_institutionId: { physicianId, institutionId } },
        create: { physicianId, institutionId },
        update: {},
      });
      expect(result.id).toBe('link-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PHYSICIAN_LINKED_TO_INSTITUTION',
          entityId: 'link-1',
          payload: { physicianId, institutionId },
        }),
      );
    });
  });

  describe('listForPhysician', () => {
    it('returns the institutions linked to the physician', async () => {
      prisma.physicianInstitution.findMany.mockResolvedValue([
        { institution: { id: institutionId, name: 'Hospital Central' } },
        { institution: { id: 'institution-b', name: 'Hospital B' } },
      ]);

      const result = await service.listForPhysician(physicianId);

      expect(prisma.physicianInstitution.findMany).toHaveBeenCalledWith({
        where: { physicianId },
        include: { institution: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        { id: institutionId, name: 'Hospital Central' },
        { id: 'institution-b', name: 'Hospital B' },
      ]);
    });

    it('returns an empty array when the physician has no institutions', async () => {
      prisma.physicianInstitution.findMany.mockResolvedValue([]);

      const result = await service.listForPhysician(physicianId);

      expect(result).toEqual([]);
    });
  });
});
