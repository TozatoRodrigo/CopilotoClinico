import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  RecommendationDecisionsService,
  buildRecommendationKey,
} from './recommendation-decisions.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const encounterId = '22222222-2222-4222-8222-222222222222';
const interactionId = '33333333-3333-4333-8333-333333333333';

const rawOutput = {
  recommendations: [
    { action: 'Solicitar ECG de 12 derivações', rationale: 'dor torácica' },
    { action: 'Iniciar AAS 300 mg', rationale: 'SCA provável' },
  ],
};

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('RecommendationDecisionsService', () => {
  let service: RecommendationDecisionsService;
  let prisma: {
    aiInteraction: { findFirst: ReturnType<typeof vi.fn> };
    encounter: { findFirst: ReturnType<typeof vi.fn> };
    recommendationDecision: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = {
      aiInteraction: { findFirst: vi.fn().mockResolvedValue({ id: interactionId, rawOutput }) },
      encounter: { findFirst: vi.fn().mockResolvedValue({ id: encounterId }) },
      recommendationDecision: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi
          .fn()
          .mockImplementation(({ create }) =>
            Promise.resolve({
              id: 'decision-1',
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new RecommendationDecisionsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('buildRecommendationKey', () => {
    it('combines the index with 12 hex chars of the action sha256', () => {
      const action = 'Solicitar ECG de 12 derivações';

      expect(buildRecommendationKey(0, action)).toBe(`0-${sha256(action).slice(0, 12)}`);
    });

    it('distinguishes two recommendations with the same action text by index', () => {
      expect(buildRecommendationKey(0, 'Repetir lactato')).not.toBe(
        buildRecommendationKey(3, 'Repetir lactato'),
      );
    });

    it('ignores surrounding whitespace so a re-serialized output keeps the key', () => {
      expect(buildRecommendationKey(1, '  Iniciar AAS 300 mg ')).toBe(
        buildRecommendationKey(1, 'Iniciar AAS 300 mg'),
      );
    });
  });

  describe('upsert', () => {
    it('derives the key from the stored analysis and upserts by (interaction, key, physician)', async () => {
      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 1,
        decision: 'adopted',
      });

      const expectedKey = buildRecommendationKey(1, 'Iniciar AAS 300 mg');
      expect(prisma.aiInteraction.findFirst).toHaveBeenCalledWith({
        where: { id: interactionId, encounter: { id: encounterId, physicianId } },
        select: { id: true, rawOutput: true },
      });
      expect(prisma.recommendationDecision.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            interactionId_recommendationKey_physicianId: {
              interactionId,
              recommendationKey: expectedKey,
              physicianId,
            },
          },
          create: expect.objectContaining({
            encounterId,
            interactionId,
            physicianId,
            recommendationIndex: 1,
            recommendationKey: expectedKey,
            decision: 'adopted',
            note: null,
          }),
          update: { decision: 'adopted', note: null },
        }),
      );
    });

    it('masks PII in the note before storing it', async () => {
      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 0,
        decision: 'modified',
        note: 'Paciente CPF 529.982.247-25 pediu ECG seriado',
      });

      const call = prisma.recommendationDecision.upsert.mock.calls[0]![0] as {
        create: { note: string };
      };
      expect(call.create.note).toBe('Paciente CPF [REDACTED_CPF] pediu ECG seriado');
    });

    it('stores an empty note as null', async () => {
      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 0,
        decision: 'adopted',
        note: '   ',
      });

      const call = prisma.recommendationDecision.upsert.mock.calls[0]![0] as {
        update: { note: string | null };
      };
      expect(call.update.note).toBeNull();
    });

    it('audits COPILOT_RECOMMENDATION_DECIDED with a hash of the stored note, never its content', async () => {
      const note = 'Paciente CPF 529.982.247-25 alérgico a AAS';

      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 1,
        decision: 'rejected',
        note,
      });

      const storedNote = 'Paciente CPF [REDACTED_CPF] alérgico a AAS';
      expect(audit.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'COPILOT_RECOMMENDATION_DECIDED',
        entity: 'AiInteraction',
        entityId: interactionId,
        payload: {
          encounterId,
          recommendationKey: buildRecommendationKey(1, 'Iniciar AAS 300 mg'),
          decision: 'rejected',
          previousDecision: null,
          noteHash: sha256(storedNote),
        },
      });
      const auditJson = JSON.stringify(audit.log.mock.calls[0]![0]);
      expect(auditJson).not.toContain('alérgico');
      expect(auditJson).not.toContain('529.982.247-25');
    });

    it('records the previous decision when the physician changes their mind', async () => {
      prisma.recommendationDecision.findUnique.mockResolvedValue({
        id: 'decision-1',
        decision: 'adopted',
        note: null,
      });

      await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 0,
        decision: 'rejected',
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ decision: 'rejected', previousDecision: 'adopted' }),
        }),
      );
    });

    it('does not write nor audit again when an identical decision is re-sent (offline retry)', async () => {
      const existing = { id: 'decision-1', decision: 'modified', note: 'Fazer ECG seriado' };
      prisma.recommendationDecision.findUnique.mockResolvedValue(existing);

      const result = await service.upsert(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 0,
        decision: 'modified',
        note: ' Fazer ECG seriado ',
      });

      expect(result).toBe(existing);
      expect(prisma.recommendationDecision.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('returns 404 for an analysis of another physician (no IDOR)', async () => {
      prisma.aiInteraction.findFirst.mockResolvedValue(null);

      await expect(
        service.upsert(physicianId, encounterId, {
          interactionId,
          recommendationIndex: 0,
          decision: 'adopted',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.recommendationDecision.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('rejects an index that does not exist in the stored analysis', async () => {
      await expect(
        service.upsert(physicianId, encounterId, {
          interactionId,
          recommendationIndex: 7,
          decision: 'adopted',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.recommendationDecision.upsert).not.toHaveBeenCalled();
    });

    it('rejects decisions on an analysis whose output has no recommendations list', async () => {
      prisma.aiInteraction.findFirst.mockResolvedValue({ id: interactionId, rawOutput: {} });

      await expect(
        service.upsert(physicianId, encounterId, {
          interactionId,
          recommendationIndex: 0,
          decision: 'adopted',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('lists only the caller decisions for the given analysis, in plan order', async () => {
      await service.list(physicianId, encounterId, interactionId);

      expect(prisma.encounter.findFirst).toHaveBeenCalledWith({
        where: { id: encounterId, physicianId },
        select: { id: true },
      });
      expect(prisma.recommendationDecision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { encounterId, interactionId, physicianId },
          orderBy: { recommendationIndex: 'asc' },
        }),
      );
    });

    it('returns 404 for an encounter of another physician (no IDOR)', async () => {
      prisma.encounter.findFirst.mockResolvedValue(null);

      await expect(service.list(physicianId, encounterId, interactionId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.recommendationDecision.findMany).not.toHaveBeenCalled();
    });
  });
});
