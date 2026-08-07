import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncountersService } from './encounters.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const otherPhysicianId = '660e8400-e29b-41d4-a716-446655440001';
const encounterId = '770e8400-e29b-41d4-a716-446655440002';
const institutionId = '880e8400-e29b-41d4-a716-446655440003';

const baseEncounter = {
  id: encounterId,
  physicianId,
  institutionId: null as string | null,
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
    aiInteraction: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let institutionsService: { listForPhysician: ReturnType<typeof vi.fn> };

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
      // PI-01 — findByPhysician() agora busca a interação mais recente de
      // cada encontro em lote para expor highestRedFlagSeverity/lastInteractionAt.
      aiInteraction: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    institutionsService = { listForPhysician: vi.fn().mockResolvedValue([]) };

    const auditService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    service = new EncountersService(
      prisma as unknown as PrismaService,
      auditService,
      institutionsService as unknown as InstitutionsService,
    );
  });

  describe('create', () => {
    it('creates encounter with pseudonymized patientRef and no institution by default', async () => {
      prisma.encounter.create.mockResolvedValue(baseEncounter);

      const result = await service.create(physicianId, createInput);

      expect(prisma.encounter.create).toHaveBeenCalledWith({
        data: {
          physicianId,
          institutionId: null,
          patientRef: createInput.patientRef,
          vertical: createInput.vertical,
          context: createInput.context,
          status: 'draft',
        },
        select: {
          id: true,
          physicianId: true,
          institutionId: true,
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

    it('defaults to the physician sole institution when none is requested', async () => {
      institutionsService.listForPhysician.mockResolvedValue([{ id: institutionId }]);
      prisma.encounter.create.mockResolvedValue({ ...baseEncounter, institutionId });

      await service.create(physicianId, createInput);

      expect(prisma.encounter.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ institutionId }) }),
      );
    });

    it('does not default when physician belongs to multiple institutions', async () => {
      institutionsService.listForPhysician.mockResolvedValue([
        { id: institutionId },
        { id: 'another-institution' },
      ]);
      prisma.encounter.create.mockResolvedValue(baseEncounter);

      await service.create(physicianId, createInput);

      expect(prisma.encounter.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ institutionId: null }) }),
      );
    });

    it('accepts an explicit institutionId when the physician belongs to it', async () => {
      institutionsService.listForPhysician.mockResolvedValue([
        { id: institutionId },
        { id: 'another-institution' },
      ]);
      prisma.encounter.create.mockResolvedValue({ ...baseEncounter, institutionId });

      await service.create(physicianId, { ...createInput, institutionId });

      expect(prisma.encounter.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ institutionId }) }),
      );
    });

    it('rejects an explicit institutionId the physician does not belong to', async () => {
      institutionsService.listForPhysician.mockResolvedValue([{ id: 'another-institution' }]);

      await expect(
        service.create(physicianId, { ...createInput, institutionId }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.encounter.create).not.toHaveBeenCalled();
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

      await expect(service.findById(physicianId, encounterId)).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for another physician's encounter", async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        ...baseEncounter,
        physicianId: otherPhysicianId,
        aiInteractions: [],
        documents: [],
      });

      await expect(service.findById(physicianId, encounterId)).rejects.toThrow(ForbiddenException);
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

      const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

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
        // PI-01 — cada encontro ganha highestRedFlagSeverity/lastInteractionAt;
        // aqui ambos null porque aiInteraction.findMany() retorna [] (default do mock).
        data: encounters.map((e) => ({
          ...e,
          highestRedFlagSeverity: null,
          lastInteractionAt: null,
        })),
        meta: { page: 1, limit: 20, total: 2 },
      });
    });

    // PI-01 — alerta de reavaliação na fila do plantão.
    describe('PI-01: highestRedFlagSeverity / lastInteractionAt', () => {
      it('exposes the highest red flag severity from the most recent AI interaction', async () => {
        prisma.encounter.findMany.mockResolvedValue([{ ...baseEncounter, id: 'enc-1' }]);
        prisma.encounter.count.mockResolvedValue(1);
        prisma.aiInteraction.findMany.mockResolvedValue([
          {
            encounterId: 'enc-1',
            createdAt: new Date('2025-06-01T10:00:00Z'),
            rawOutput: {
              redFlags: [
                { finding: 'Febre', severity: 'moderate', action: 'Investigar foco' },
                { finding: 'Hipotensão', severity: 'critical', action: 'Reposição volêmica' },
                { finding: 'Taquicardia', severity: 'high', action: 'Monitorar' },
              ],
            },
          },
        ]);

        const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        expect(result.data[0]?.highestRedFlagSeverity).toBe('critical');
        expect(result.data[0]?.lastInteractionAt).toBe('2025-06-01T10:00:00.000Z');
      });

      it('batches into a single aiInteraction.findMany call for the whole page (no N+1)', async () => {
        prisma.encounter.findMany.mockResolvedValue([
          { ...baseEncounter, id: 'enc-1' },
          { ...baseEncounter, id: 'enc-2' },
          { ...baseEncounter, id: 'enc-3' },
        ]);
        prisma.encounter.count.mockResolvedValue(3);
        prisma.aiInteraction.findMany.mockResolvedValue([]);

        await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        expect(prisma.aiInteraction.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.aiInteraction.findMany).toHaveBeenCalledWith({
          where: { encounterId: { in: ['enc-1', 'enc-2', 'enc-3'] } },
          orderBy: { createdAt: 'desc' },
          select: { encounterId: true, rawOutput: true, createdAt: true },
        });
      });

      it('uses only the LATEST turn per encounter, not the historical maximum across turns', async () => {
        prisma.encounter.findMany.mockResolvedValue([{ ...baseEncounter, id: 'enc-1' }]);
        prisma.encounter.count.mockResolvedValue(1);
        // orderBy desc — turno mais recente (10:30) vem primeiro no array.
        prisma.aiInteraction.findMany.mockResolvedValue([
          {
            encounterId: 'enc-1',
            createdAt: new Date('2025-06-01T10:30:00Z'),
            rawOutput: { redFlags: [{ finding: 'Febre baixa', severity: 'moderate', action: 'Observar' }] },
          },
          {
            encounterId: 'enc-1',
            createdAt: new Date('2025-06-01T10:00:00Z'),
            rawOutput: { redFlags: [{ finding: 'Choque', severity: 'critical', action: 'Estabilizar' }] },
          },
        ]);

        const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        // O choque crítico foi do turno 1, já reavaliado — o turno mais
        // recente só tem achado moderado. O alerta reflete o AGORA.
        expect(result.data[0]?.highestRedFlagSeverity).toBe('moderate');
      });

      it('returns null severity when the latest interaction has no red flags', async () => {
        prisma.encounter.findMany.mockResolvedValue([{ ...baseEncounter, id: 'enc-1' }]);
        prisma.encounter.count.mockResolvedValue(1);
        prisma.aiInteraction.findMany.mockResolvedValue([
          { encounterId: 'enc-1', createdAt: new Date('2025-06-01T10:00:00Z'), rawOutput: { redFlags: [] } },
        ]);

        const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        expect(result.data[0]?.highestRedFlagSeverity).toBeNull();
        expect(result.data[0]?.lastInteractionAt).not.toBeNull();
      });

      it('returns null severity AND null lastInteractionAt for an encounter with no analysis yet', async () => {
        prisma.encounter.findMany.mockResolvedValue([{ ...baseEncounter, id: 'enc-1' }]);
        prisma.encounter.count.mockResolvedValue(1);
        prisma.aiInteraction.findMany.mockResolvedValue([]);

        const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        expect(result.data[0]?.highestRedFlagSeverity).toBeNull();
        expect(result.data[0]?.lastInteractionAt).toBeNull();
      });

      it('does not crash on a legacy/malformed rawOutput missing redFlags entirely', async () => {
        prisma.encounter.findMany.mockResolvedValue([{ ...baseEncounter, id: 'enc-1' }]);
        prisma.encounter.count.mockResolvedValue(1);
        prisma.aiInteraction.findMany.mockResolvedValue([
          { encounterId: 'enc-1', createdAt: new Date('2025-06-01T10:00:00Z'), rawOutput: { reasoning: 'x' } },
        ]);

        const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        expect(result.data[0]?.highestRedFlagSeverity).toBeNull();
      });

      it('skips the batch query entirely (and does not call aiInteraction.findMany) when the page is empty', async () => {
        prisma.encounter.findMany.mockResolvedValue([]);
        prisma.encounter.count.mockResolvedValue(0);

        await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        expect(prisma.aiInteraction.findMany).not.toHaveBeenCalled();
      });

      it('correctly maps severities across multiple different encounters in the same page', async () => {
        prisma.encounter.findMany.mockResolvedValue([
          { ...baseEncounter, id: 'enc-1' },
          { ...baseEncounter, id: 'enc-2' },
        ]);
        prisma.encounter.count.mockResolvedValue(2);
        prisma.aiInteraction.findMany.mockResolvedValue([
          {
            encounterId: 'enc-1',
            createdAt: new Date('2025-06-01T10:00:00Z'),
            rawOutput: { redFlags: [{ finding: 'A', severity: 'high', action: 'x' }] },
          },
          {
            encounterId: 'enc-2',
            createdAt: new Date('2025-06-01T09:00:00Z'),
            rawOutput: { redFlags: [{ finding: 'B', severity: 'moderate', action: 'y' }] },
          },
        ]);

        const result = await service.findByPhysician(physicianId, { page: 1, limit: 20 });

        const byId = new Map(result.data.map((e) => [e.id, e]));
        expect(byId.get('enc-1')?.highestRedFlagSeverity).toBe('high');
        expect(byId.get('enc-2')?.highestRedFlagSeverity).toBe('moderate');
      });
    });

    it('respects pagination offset', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(25);

      const result = await service.findByPhysician(physicianId, { page: 2, limit: 10 });

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 25 });
    });

    it('filters by status', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);

      await service.findByPhysician(physicianId, { page: 1, limit: 20, status: 'draft' });

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'draft' }),
        }),
      );
    });

    it('filters by vertical', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);

      await service.findByPhysician(physicianId, { page: 1, limit: 20, vertical: 'trauma' });

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vertical: 'trauma' }),
        }),
      );
    });

    it('filters by patientRef search (case-insensitive)', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);

      await service.findByPhysician(physicianId, { page: 1, limit: 20, search: 'PAT' });

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ patientRef: { contains: 'PAT', mode: 'insensitive' } }),
        }),
      );
    });

    it('filters by date range', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);

      await service.findByPhysician(physicianId, {
        page: 1,
        limit: 20,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      });

      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
    });

    it('applies combined filters', async () => {
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.encounter.count.mockResolvedValue(0);

      await service.findByPhysician(physicianId, {
        page: 1,
        limit: 20,
        status: 'draft',
        vertical: 'trauma',
        search: 'PAT',
      });

      const whereArg = prisma.encounter.findMany.mock.calls[0]![0]!.where;
      expect(whereArg).toEqual(
        expect.objectContaining({
          physicianId,
          status: 'draft',
          vertical: 'trauma',
          patientRef: { contains: 'PAT', mode: 'insensitive' },
        }),
      );
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
          institutionId: true,
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

    // UX-04 — vertical passa a ser confirmável/corrigível depois da criação
    // do caso via este mesmo PATCH, em vez de ser um campo bloqueante na
    // captura. `update()` já repassa `input` inteiro ao Prisma sem
    // whitelist própria, então basta o schema aceitar o campo (ver
    // encounter.schemas.spec.ts) para chegar até aqui.
    it('updates vertical when the physician confirms/corrects the inferred value', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        status: 'in_review',
      });
      prisma.encounter.update.mockResolvedValue({
        ...baseEncounter,
        vertical: 'cardiac',
      });

      const result = await service.update(physicianId, encounterId, {
        vertical: 'cardiac',
      });

      expect(prisma.encounter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { vertical: 'cardiac' } }),
      );
      expect(result.vertical).toBe('cardiac');
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

    it('allows cancelling a draft encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        status: 'draft',
      });
      prisma.encounter.update.mockResolvedValue({
        ...baseEncounter,
        status: 'cancelled',
      });

      const result = await service.update(physicianId, encounterId, {
        status: 'cancelled',
      });

      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: encounterId },
        data: { status: 'cancelled' },
        select: expect.any(Object),
      });
      expect(result.status).toBe('cancelled');
    });

    it("throws ForbiddenException for another physician's encounter", async () => {
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
