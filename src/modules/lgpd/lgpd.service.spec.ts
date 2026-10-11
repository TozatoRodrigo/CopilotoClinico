import { describe, it, expect, expectTypeOf, beforeEach, vi } from 'vitest';
import { LgpdService, type ExportedAudioCapture } from './lgpd.service';
import { PrismaService } from '../../config/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const consentId = '660e8400-e29b-41d4-a716-446655440001';

describe('LgpdService', () => {
  let service: LgpdService;
  let prisma: {
    consent: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    physician: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    encounter: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    document: {
      findMany: ReturnType<typeof vi.fn>;
    };
    aiInteraction: {
      findMany: ReturnType<typeof vi.fn>;
    };
    auditLog: {
      findMany: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    recommendationDecision: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    copilotFeedback: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    audioCapture: {
      findMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let auditService: {
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      consent: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      physician: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      encounter: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      document: {
        findMany: vi.fn(),
      },
      aiInteraction: {
        findMany: vi.fn(),
      },
      auditLog: {
        findMany: vi.fn(),
      },
      refreshToken: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      recommendationDecision: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      copilotFeedback: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      audioCapture: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(),
    };
    auditService = {
      log: vi.fn(),
    };

    service = new LgpdService(prisma as unknown as PrismaService, auditService as never);
  });

  describe('grantConsent', () => {
    it('creates a consent record', async () => {
      const consent = {
        id: consentId,
        physicianId,
        scope: 'ai_processing',
        grantedAt: new Date(),
        revokedAt: null,
      };
      prisma.consent.findFirst.mockResolvedValue(null);
      prisma.consent.create.mockResolvedValue(consent);

      const result = await service.grantConsent(physicianId, 'ai_processing');

      expect(prisma.consent.findFirst).toHaveBeenCalledWith({
        where: { physicianId, scope: 'ai_processing', revokedAt: null },
      });
      expect(prisma.consent.create).toHaveBeenCalledWith({
        data: { physicianId, scope: 'ai_processing' },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'CONSENT_GRANTED',
        entity: 'Consent',
        entityId: consentId,
        payload: { scope: 'ai_processing' },
      });
      expect(result).toEqual(consent);
    });

    it('returns the active consent without creating duplicates for the same scope', async () => {
      const activeConsent = {
        id: consentId,
        physicianId,
        scope: 'ai_processing',
        grantedAt: new Date(),
        revokedAt: null,
      };
      prisma.consent.findFirst.mockResolvedValue(activeConsent);

      const result = await service.grantConsent(physicianId, 'ai_processing');

      expect(prisma.consent.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result).toBe(activeConsent);
    });

    it('rejects unsupported consent scopes before writing data', async () => {
      await expect(service.grantConsent(physicianId, 'unknown_scope')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.consent.findFirst).not.toHaveBeenCalled();
      expect(prisma.consent.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('revokeConsent', () => {
    it('revokes an active consent', async () => {
      const activeConsent = {
        id: consentId,
        physicianId,
        scope: 'ai_processing',
        grantedAt: new Date(),
        revokedAt: null,
      };
      const revokedConsent = {
        ...activeConsent,
        revokedAt: new Date(),
      };
      prisma.consent.findFirst.mockResolvedValue(activeConsent);
      prisma.consent.update.mockResolvedValue(revokedConsent);

      const result = await service.revokeConsent(physicianId, 'ai_processing');

      expect(prisma.consent.findFirst).toHaveBeenCalledWith({
        where: { physicianId, scope: 'ai_processing', revokedAt: null },
      });
      expect(prisma.consent.update).toHaveBeenCalledWith({
        where: { id: consentId },
        data: { revokedAt: expect.any(Date) },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'CONSENT_REVOKED',
        entity: 'Consent',
        entityId: consentId,
        payload: { scope: 'ai_processing' },
      });
      expect(result.revokedAt).not.toBeNull();
    });

    it('throws NotFoundException when no active consent exists', async () => {
      prisma.consent.findFirst.mockResolvedValue(null);

      await expect(service.revokeConsent(physicianId, 'ai_processing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects unsupported consent scopes before revoking data', async () => {
      await expect(service.revokeConsent(physicianId, 'unknown_scope')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.consent.findFirst).not.toHaveBeenCalled();
      expect(prisma.consent.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('checkConsent', () => {
    it('returns true when active consent exists', async () => {
      prisma.consent.findFirst.mockResolvedValue({
        id: consentId,
        physicianId,
        scope: 'ai_processing',
        grantedAt: new Date(),
        revokedAt: null,
      });

      const result = await service.checkConsent(physicianId, 'ai_processing');

      expect(result).toBe(true);
    });

    it('returns false when no active consent exists', async () => {
      prisma.consent.findFirst.mockResolvedValue(null);

      const result = await service.checkConsent(physicianId, 'ai_processing');

      expect(result).toBe(false);
    });

    it('rejects unsupported consent scopes before checking data', async () => {
      await expect(service.checkConsent(physicianId, 'unknown_scope')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.consent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('listConsentScopes', () => {
    it('returns current consent status for every supported scope', async () => {
      const aiGrantedAt = new Date('2026-01-01T00:00:00.000Z');
      const analyticsGrantedAt = new Date('2026-01-02T00:00:00.000Z');
      const analyticsRevokedAt = new Date('2026-01-03T00:00:00.000Z');

      prisma.consent.findMany.mockResolvedValue([
        {
          id: 'consent-ai',
          physicianId,
          scope: 'ai_processing',
          grantedAt: aiGrantedAt,
          revokedAt: null,
        },
        {
          id: 'consent-analytics',
          physicianId,
          scope: 'analytics',
          grantedAt: analyticsGrantedAt,
          revokedAt: analyticsRevokedAt,
        },
      ]);

      const result = await service.listConsentScopes(physicianId);

      expect(prisma.consent.findMany).toHaveBeenCalledWith({
        where: { physicianId },
        orderBy: { grantedAt: 'desc' },
      });
      expect(result).toEqual([
        {
          scope: 'ai_processing',
          granted: true,
          grantedAt: aiGrantedAt,
          revokedAt: null,
        },
        {
          scope: 'data_sharing',
          granted: false,
          grantedAt: null,
          revokedAt: null,
        },
        {
          scope: 'analytics',
          granted: false,
          grantedAt: analyticsGrantedAt,
          revokedAt: analyticsRevokedAt,
        },
      ]);
    });
  });

  describe('exportPhysicianData', () => {
    const audioCaptures: ExportedAudioCapture[] = [
      {
        id: 'aud-1',
        encounterId: 'enc-1',
        mimeType: 'audio/webm',
        sizeBytes: 48_000,
        status: 'completed',
        transcribedText: 'CPF [REDACTED_CPF], dor torácica há duas horas',
        retainUntil: new Date('2026-11-09T12:00:00.000Z'),
        createdAt: new Date('2026-10-10T12:00:00.000Z'),
        updatedAt: new Date('2026-10-10T12:01:00.000Z'),
      },
      {
        // Áudio eliminado pela retenção: a linha e a transcrição mascarada continuam.
        id: 'aud-2',
        encounterId: 'enc-1',
        mimeType: 'audio/webm',
        sizeBytes: 32_000,
        status: 'deleted',
        transcribedText: 'Febre há três dias',
        retainUntil: new Date('2026-10-01T12:00:00.000Z'),
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-10-01T13:15:00.000Z'),
      },
    ];

    it('returns all physician data', async () => {
      const physician = {
        id: physicianId,
        crmUf: 'SP',
        crmNumber: '123456',
        email: 'test@test.com',
        name: 'Dr Test',
        mfaEnabled: false,
        subscriptionStatus: 'trial',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const encounters = [{ id: 'enc-1', physicianId, vertical: 'trauma', patientRef: 'PAT-001' }];
      const documents = [{ id: 'doc-1', physicianId, encounterId: 'enc-1', type: 'soap' }];
      const aiInteractions = [{ id: 'ai-1', encounterId: 'enc-1', model: 'gpt-4' }];
      const consents = [{ id: consentId, physicianId, scope: 'ai_processing' }];
      const auditLog = [{ id: 'log-1', actorId: physicianId, action: 'LOGIN' }];
      const refreshTokens = [{ id: 'rt-1', physicianId, tokenHash: 'hash' }];
      const recommendationDecisions = [
        {
          id: 'dec-1',
          physicianId,
          encounterId: 'enc-1',
          interactionId: 'ai-1',
          recommendationIndex: 0,
          recommendationKey: '0-abcdef123456',
          decision: 'modified',
          note: 'Ajustar dose',
        },
      ];

      const copilotFeedback = [
        {
          id: 'fb-1',
          physicianId,
          encounterId: 'enc-1',
          interactionId: 'ai-1',
          kind: 'wrong_scenario',
          comment: 'Era dengue',
          status: 'new',
        },
      ];

      prisma.physician.findUnique.mockResolvedValue(physician);
      prisma.recommendationDecision.findMany.mockResolvedValue(recommendationDecisions);
      prisma.copilotFeedback.findMany.mockResolvedValue(copilotFeedback);
      prisma.audioCapture.findMany.mockResolvedValue(audioCaptures);
      prisma.encounter.findMany.mockResolvedValue(encounters);
      prisma.document.findMany.mockResolvedValue(documents);
      prisma.consent.findMany.mockResolvedValue(consents);
      prisma.auditLog.findMany.mockResolvedValue(auditLog);
      prisma.refreshToken.findMany.mockResolvedValue(refreshTokens);
      prisma.aiInteraction.findMany.mockResolvedValue(aiInteractions);

      const result = await service.exportPhysicianData(physicianId);

      expect(result).toEqual({
        exportVersion: 'lgpd-portability-v1',
        generatedAt: expect.any(String),
        dataSubject: {
          type: 'physician',
          id: physicianId,
        },
        data: {
          physician,
          encounters,
          documents,
          aiInteractions,
          recommendationDecisions,
          copilotFeedback,
          audioCaptures,
          consents,
          auditLog,
        },
      });
      expect(prisma.copilotFeedback.findMany).toHaveBeenCalledWith({ where: { physicianId } });
      // F0-D — decisões por recomendação são dado do médico: entram na portabilidade.
      expect(prisma.recommendationDecision.findMany).toHaveBeenCalledWith({
        where: { physicianId },
      });
      expect(JSON.stringify(result)).not.toContain('tokenHash');
      expect(JSON.stringify(result)).not.toContain('hash');
      expect(JSON.stringify(result)).not.toContain('refreshTokens');
      expect(prisma.aiInteraction.findMany).toHaveBeenCalledWith({
        where: { encounterId: { in: ['enc-1'] } },
      });
    });

    it('exports audio capture metadata and masked transcript, never the encrypted audio', async () => {
      prisma.physician.findUnique.mockResolvedValue({ id: physicianId });
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.consent.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.audioCapture.findMany.mockResolvedValue(audioCaptures);

      const result = await service.exportPhysicianData(physicianId);

      // Allowlist exata: `encryptedContent` (áudio cifrado) e `jobId` (fila) não saem.
      expect(prisma.audioCapture.findMany).toHaveBeenCalledWith({
        where: { physicianId },
        select: {
          id: true,
          encounterId: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          transcribedText: true,
          retainUntil: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result.data.audioCaptures).toEqual(audioCaptures);
      expectTypeOf<ExportedAudioCapture>().not.toHaveProperty('encryptedContent');
    });

    it('does not query refresh tokens for portability exports', async () => {
      prisma.physician.findUnique.mockResolvedValue({
        id: physicianId,
        crmUf: 'SP',
        crmNumber: '123456',
        email: 'test@test.com',
        name: 'Dr Test',
        subscriptionStatus: 'trial',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.consent.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.exportPhysicianData(physicianId);

      expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    });

    it('returns empty aiInteractions when physician has no encounters', async () => {
      prisma.physician.findUnique.mockResolvedValue({
        id: physicianId,
        crmUf: 'SP',
        crmNumber: '123456',
        email: 'test@test.com',
        name: 'Dr Test',
        mfaEnabled: false,
        subscriptionStatus: 'trial',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.encounter.findMany.mockResolvedValue([]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.consent.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.refreshToken.findMany.mockResolvedValue([]);

      const result = await service.exportPhysicianData(physicianId);

      expect(result.data.aiInteractions).toEqual([]);
      expect(prisma.aiInteraction.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing physician', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.exportPhysicianData(physicianId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestErasure', () => {
    it('anonymizes physician and deletes related data', async () => {
      const physician = {
        id: physicianId,
        crmUf: 'SP',
        crmNumber: '123456',
        email: 'test@test.com',
        passwordHash: 'hash',
        name: 'Dr Test',
        mfaEnabled: false,
        mfaSecret: 'secret',
        subscriptionStatus: 'trial',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.physician.findUnique.mockResolvedValue(physician);

      prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<void>) =>
        cb(prisma),
      );

      prisma.recommendationDecision.deleteMany.mockResolvedValue({ count: 4 });
      prisma.copilotFeedback.deleteMany.mockResolvedValue({ count: 3 });
      prisma.encounter.deleteMany.mockResolvedValue({ count: 2 });
      prisma.consent.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.physician.update.mockResolvedValue({
        ...physician,
        name: 'ERASED',
        email: `erased-${physicianId}@erased.com`,
        passwordHash: `erased:${physicianId}`,
      });
      auditService.log.mockResolvedValue({
        id: 'log-1',
        actorId: physicianId,
        action: 'DATA_ERASURE',
        entity: 'Physician',
        entityId: physicianId,
        beforeHash: null,
        afterHash: null,
        payload: { reason: 'LGPD Art. 18, VI - Data erasure request' },
        ip: null,
        createdAt: new Date(),
      });

      const result = await service.requestErasure(physicianId);

      expect(result.status).toBe('completed');
      expect(result.estimatedCompletion).toBeInstanceOf(Date);
      expect(result.erased).toEqual({
        recommendationDecisions: 4,
        copilotFeedback: 3,
        encounters: 2,
        consents: 1,
        refreshTokens: 1,
      });
      expect(prisma.recommendationDecision.deleteMany).toHaveBeenCalledWith({
        where: { physicianId },
      });
      expect(prisma.copilotFeedback.deleteMany).toHaveBeenCalledWith({ where: { physicianId } });
      expect(prisma.encounter.deleteMany).toHaveBeenCalledWith({
        where: { physicianId },
      });
      expect(prisma.consent.deleteMany).toHaveBeenCalledWith({
        where: { physicianId },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { physicianId },
      });
      expect(prisma.physician.update).toHaveBeenCalledWith({
        where: { id: physicianId },
        data: {
          name: 'ERASED',
          email: `erased-${physicianId}@erased.com`,
          passwordHash: `erased:${physicianId}`,
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'DATA_ERASURE',
        entity: 'Physician',
        entityId: physicianId,
        payload: {
          reason: 'LGPD Art. 18, VI - Data erasure request',
          erased: {
            recommendationDecisions: 4,
            copilotFeedback: 3,
            encounters: 2,
            consents: 1,
            refreshTokens: 1,
          },
        },
      });
    });

    it('throws NotFoundException for missing physician', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.requestErasure(physicianId)).rejects.toThrow(NotFoundException);
    });
  });
});
