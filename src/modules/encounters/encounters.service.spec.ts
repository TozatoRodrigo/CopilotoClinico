import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncountersService } from './encounters.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const otherPhysicianId = '660e8400-e29b-41d4-a716-446655440001';
const encounterId = '770e8400-e29b-41d4-a716-446655440002';

const baseEncounter = {
  id: encounterId,
  physicianId,
  vertical: 'trauma',
  patientRef: 'PAT-001',
  status: 'draft' as const,
  context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const createInput = {
  patientRef: 'PAT-001',
  vertical: 'trauma',
  context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
};

describe('EncountersService', () => {
  let service: EncountersService;
  let prisma: {
    encounter: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      encounter: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
    };

    const auditService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    service = new EncountersService(prisma as unknown as PrismaService, auditService);
  });

  describe('create', () => {
    it('creates encounter with pseudonymized patientRef', async () => {
      prisma.encounter.create.mockResolvedValue(baseEncounter);

      const result = await service.create(physicianId, createInput);

      expect(prisma.encounter.create).toHaveBeenCalledWith({
        data: {
          physicianId,
          patientRef: createInput.patientRef,
          vertical: createInput.vertical,
          context: createInput.context,
          status: 'draft',
        },
        select: {
          id: true,
          physicianId: true,
          vertical: true,
          context: true,
          patientRef: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result).toEqual(baseEncounter);
    });
  });

  describe('findById', () => {
    it('returns encounter with relations', async () => {
      const encounterWithRelations = {
        ...baseEncounter,
        aiInteractions: [
          {
            id: 'ai-1',
            model: 'gpt-4',
            uncertainty: false,
            latencyMs: 1200,
            cost: 0.03,
            createdAt: new Date('2025-01-01'),
          },
        ],
        documents: [
          {
            id: 'doc-1',
            type: 'soap',
            confirmedBy: null,
            confirmedAt: null,
            contentHash: 'abc123',
            createdAt: new Date('2025-01-01'),
          },
        ],
      };
      prisma.encounter.findUnique.mockResolvedValue(encounterWithRelations);

      const result = await service.findById(physicianId, encounterId);

      expect(result).toEqual(encounterWithRelations);
      expect(result.aiInteractions).toHaveLength(1);
      expect(result.documents).toHaveLength(1);
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.findById(physicianId, encounterId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for another physician\'s encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        ...baseEncounter,
        physicianId: otherPhysicianId,
        aiInteractions: [],
        documents: [],
      });

      await expect(service.findById(physicianId, encounterId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findByPhysician', () => {
    it('returns paginated list of own encounters', async () => {
      const encounters = [
        { ...baseEncounter, id: 'enc-1' },
        { ...baseEncounter, id: 'enc-2' },
      ];
      prisma.encounter.findMany.mockResolvedValue(encounters);
      prisma.encounter.count.mockResolvedValue(2);

      const result = await service.findByPhysician(physicianId, 1, 20);

      expect(prisma.encounter.findMany).toHaveBeenCalledWith({
        where: { physicianId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        select: {
          id: true,
          vertical: true,
          patientRef: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(prisma.encounter.count).toHaveBeenCalledWith({
        where: { physicianId },
      });
      expect(result).toEqual({
        data: encounters,
        meta: { page: 1, limit: 20, total: 2 },
      });
    });

    it('respects pagination offset', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(25);

      const result = await service.findByPhysician(physicianId, 2, 10);

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 25 });
    });
  });

  describe('update', () => {
    it('updates status from draft to in_review', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        status: 'draft',
      });
      prisma.encounter.update.mockResolvedValue({
        ...baseEncounter,
        status: 'in_review',
      });

      const result = await service.update(physicianId, encounterId, {
        status: 'in_review',
      });

      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: encounterId },
        data: { status: 'in_review' },
        select: {
          id: true,
          physicianId: true,
          vertical: true,
          context: true,
          patientRef: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result.status).toBe('in_review');
    });

    it('throws ForbiddenException when trying to update finalized encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        status: 'finalized',
      });

      await expect(
        service.update(physicianId, encounterId, { status: 'in_review' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.encounter.update).not.toHaveBeenCalled();
    });

    it('allows cancelling a finalized encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        status: 'finalized',
      });
      prisma.encounter.update.mockResolvedValue({
        ...baseEncounter,
        status: 'cancelled',
      });

      const result = await service.update(physicianId, encounterId, {
        status: 'cancelled',
      });

      expect(result.status).toBe('cancelled');
    });

    it('throws ForbiddenException for another physician\'s encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        status: 'draft',
      });

      await expect(
        service.update(physicianId, encounterId, { status: 'in_review' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.update(physicianId, encounterId, { status: 'in_review' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
