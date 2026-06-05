import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const otherPhysicianId = '660e8400-e29b-41d4-a716-446655440001';
const encounterId = '770e8400-e29b-41d4-a716-446655440002';
const aiInteractionId = '880e8400-e29b-41d4-a716-446655440003';
const documentId = '990e8400-e29b-41d4-a716-446655440004';

const copilotRawOutput = {
  reasoning: 'Patient shows signs of hypertension',
  recommendations: [
    {
      action: 'Initiate ACE inhibitor therapy',
      rationale: 'BP consistently above 140/90',
      citationChunkId: 'chunk-1',
      confidence: 0.85,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
};

const baseDocument = {
  id: documentId,
  encounterId,
  type: 'soap',
  content: {
    subjective: 'Patient shows signs of hypertension',
    objective: 'Raciocínio clínico: Patient shows signs of hypertension',
    assessment: 'Baseado em 1 recomendações fundamentadas em diretrizes',
    plan: '- Initiate ACE inhibitor therapy (BP consistently above 140/90)',
  },
  physicianEdits: null,
  confirmedBy: null,
  confirmedAt: null,
  contentHash: 'abc123hash',
  createdAt: new Date('2025-01-01'),
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: {
    encounter: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    aiInteraction: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    document: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      encounter: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      aiInteraction: {
        findUnique: vi.fn(),
      },
      document: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    };

    service = new DocumentsService(prisma as unknown as PrismaService);
  });

  describe('generate', () => {
    it('creates document with content hash', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue({
        rawOutput: copilotRawOutput,
      });
      prisma.document.create.mockResolvedValue(baseDocument);

      const result = await service.generate(physicianId, encounterId, {
        type: 'soap',
        aiInteractionId,
      });

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            encounterId,
            physicianId,
            type: 'soap',
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
      expect(result).toEqual(baseDocument);
    });

    it('creates SBAR document', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue({
        rawOutput: copilotRawOutput,
      });
      prisma.document.create.mockResolvedValue({
        ...baseDocument,
        type: 'sbar',
      });

      const result = await service.generate(physicianId, encounterId, {
        type: 'sbar',
        aiInteractionId,
      });

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'sbar' }),
        }),
      );
      expect(result.type).toBe('sbar');
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        patientRef: 'PAT-001',
      });

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for missing AI interaction', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue(null);

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('edit', () => {
    it('saves physician edits before confirmation', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: null,
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        physicianEdits: { subjective: 'Edited text' },
      });

      const result = await service.edit(physicianId, documentId, {
        physicianEdits: { subjective: 'Edited text' },
      });

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { physicianEdits: { subjective: 'Edited text' } },
        select: expect.any(Object),
      });
      expect(result.physicianEdits).toEqual({ subjective: 'Edited text' });
    });

    it('throws NotFoundException for missing document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        confirmedBy: null,
      });

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for confirmed document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: physicianId,
      });

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirm', () => {
    it('locks document with confirmedBy + confirmedAt', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: null,
        encounterId,
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: expect.any(Date),
      });
      prisma.encounter.update.mockResolvedValue({});

      const result = await service.confirm(physicianId, documentId);

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: {
          confirmedBy: physicianId,
          confirmedAt: expect.any(Date),
        },
        select: expect.any(Object),
      });
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: encounterId },
        data: { status: 'finalized' },
      });
      expect(result.confirmedBy).toBe(physicianId);
    });

    it('throws NotFoundException for missing document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        confirmedBy: null,
        encounterId,
      });

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException for double confirmation', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: physicianId,
        encounterId,
      });

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByEncounter', () => {
    it('returns documents for own encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({ physicianId });
      prisma.document.findMany.mockResolvedValue([baseDocument]);

      const result = await service.findByEncounter(physicianId, encounterId);

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: { encounterId },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result).toEqual([baseDocument]);
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.findByEncounter(physicianId, encounterId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for another physician encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
      });

      await expect(service.findByEncounter(physicianId, encounterId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
