import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LgpdService } from './lgpd.service';
import { PrismaService } from '../../config/prisma.service';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

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
    encounterAttachment: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    audioCapture: {
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
      deleteMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let auditService: {
    log: ReturnType<typeof vi.fn>;
  };
  let storage: {
    deleteObjects: ReturnType<typeof vi.fn>;
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
      encounterAttachment: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      audioCapture: {
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
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
      },
      refreshToken: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    auditService = {
      log: vi.fn(),
    };
    storage = {
      deleteObjects: vi.fn().mockResolvedValue(undefined),
    };

    service = new LgpdService(
      prisma as unknown as PrismaService,
      auditService as never,
      storage as never,
    );
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
      const encounterAttachments = [
        {
          id: 'att-1',
          encounterId: 'enc-1',
          physicianId,
          filename: 'diretriz-dengue.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
          text: 'Hidratação venosa no grupo C. Paciente [NOME_REDACTED].',
          createdAt: new Date(),
        },
      ];
      const audioCaptures = [
        {
          id: 'audio-1',
          encounterId: 'enc-1',
          physicianId,
          mimeType: 'audio/webm',
          sizeBytes: 4096,
          status: 'completed',
          jobId: 'job-1',
          transcribedText: 'Paciente com febre há 3 dias, CPF [CPF_REDACTED].',
          retainUntil: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const consents = [{ id: consentId, physicianId, scope: 'ai_processing' }];
      const auditLog = [{ id: 'log-1', actorId: physicianId, action: 'LOGIN' }];
      const refreshTokens = [{ id: 'rt-1', physicianId, tokenHash: 'hash' }];

      prisma.physician.findUnique.mockResolvedValue(physician);
      prisma.encounter.findMany.mockResolvedValue(encounters);
      prisma.document.findMany.mockResolvedValue(documents);
      prisma.consent.findMany.mockResolvedValue(consents);
      prisma.auditLog.findMany.mockResolvedValue(auditLog);
      prisma.refreshToken.findMany.mockResolvedValue(refreshTokens);
      prisma.aiInteraction.findMany.mockResolvedValue(aiInteractions);
      prisma.encounterAttachment.findMany.mockResolvedValue(encounterAttachments);
      prisma.audioCapture.findMany.mockResolvedValue(audioCaptures);

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
          encounterAttachments,
          audioCaptures,
          documents,
          aiInteractions,
          consents,
          auditLog,
        },
      });
      expect(JSON.stringify(result)).not.toContain('tokenHash');
      expect(JSON.stringify(result)).not.toContain('hash');
      expect(JSON.stringify(result)).not.toContain('refreshTokens');
      expect(prisma.aiInteraction.findMany).toHaveBeenCalledWith({
        where: { encounterId: { in: ['enc-1'] } },
      });
    });

    it('exports attachments with their redacted text, scoped to the physician encounters', async () => {
      prisma.physician.findUnique.mockResolvedValue({ id: physicianId });
      prisma.encounter.findMany.mockResolvedValue([
        { id: 'enc-1', physicianId },
        { id: 'enc-2', physicianId },
      ]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.consent.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.aiInteraction.findMany.mockResolvedValue([]);
      prisma.audioCapture.findMany.mockResolvedValue([]);
      const attachment = {
        id: 'att-1',
        encounterId: 'enc-2',
        physicianId,
        filename: 'abramede-sepse.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        text: 'Lactato > 2 mmol/L.',
        createdAt: new Date(),
      };
      prisma.encounterAttachment.findMany.mockResolvedValue([attachment]);

      const result = await service.exportPhysicianData(physicianId);

      expect(prisma.encounterAttachment.findMany).toHaveBeenCalledWith({
        where: { encounterId: { in: ['enc-1', 'enc-2'] } },
      });
      expect(result.data.encounterAttachments).toEqual([attachment]);
    });

    it('exports audio metadata and transcript but never the encrypted audio', async () => {
      prisma.physician.findUnique.mockResolvedValue({ id: physicianId });
      prisma.encounter.findMany.mockResolvedValue([{ id: 'enc-1', physicianId }]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.consent.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.aiInteraction.findMany.mockResolvedValue([]);
      prisma.encounterAttachment.findMany.mockResolvedValue([]);
      const audio = {
        id: 'audio-1',
        encounterId: 'enc-1',
        physicianId,
        mimeType: 'audio/webm',
        sizeBytes: 4096,
        status: 'completed',
        jobId: null,
        transcribedText: 'Dor torácica há 2 horas.',
        retainUntil: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.audioCapture.findMany.mockResolvedValue([audio]);

      const result = await service.exportPhysicianData(physicianId);

      expect(prisma.audioCapture.findMany).toHaveBeenCalledWith({
        where: { encounterId: { in: ['enc-1'] } },
        omit: { encryptedContent: true },
      });
      expect(result.data.audioCaptures).toEqual([audio]);
      expect(result.data.audioCaptures[0]?.transcribedText).toBe('Dor torácica há 2 horas.');
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

    it('returns empty encounter-scoped collections when physician has no encounters', async () => {
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
      expect(result.data.encounterAttachments).toEqual([]);
      expect(result.data.audioCaptures).toEqual([]);
      expect(prisma.aiInteraction.findMany).not.toHaveBeenCalled();
      expect(prisma.encounterAttachment.findMany).not.toHaveBeenCalled();
      expect(prisma.audioCapture.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing physician', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.exportPhysicianData(physicianId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestErasure', () => {
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

    beforeEach(() => {
      prisma.physician.findUnique.mockResolvedValue(physician);
      prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<void>) =>
        cb(prisma),
      );
      prisma.document.findMany.mockResolvedValue([]);
      prisma.encounterAttachment.deleteMany.mockResolvedValue({ count: 0 });
      prisma.audioCapture.deleteMany.mockResolvedValue({ count: 0 });
      prisma.encounter.deleteMany.mockResolvedValue({ count: 0 });
      prisma.consent.deleteMany.mockResolvedValue({ count: 0 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.physician.update.mockResolvedValue({
        ...physician,
        name: 'ERASED',
        email: `erased-${physicianId}@erased.com`,
        passwordHash: `erased:${physicianId}`,
      });
      auditService.log.mockResolvedValue({ id: 'log-1' });
    });

    it('anonymizes physician and deletes related data', async () => {
      prisma.encounter.deleteMany.mockResolvedValue({ count: 2 });
      prisma.consent.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.requestErasure(physicianId);

      expect(result.status).toBe('completed');
      expect(result.estimatedCompletion).toBeInstanceOf(Date);
      expect(result.erased).toEqual({
        encounters: 2,
        encounterAttachments: 0,
        audioCaptures: 0,
        consents: 1,
        refreshTokens: 1,
        storageObjects: 0,
      });
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
          erased: result.erased,
        },
      });
    });

    it('deletes attachments and audio captures of the physician encounters and reports the counts', async () => {
      prisma.encounterAttachment.deleteMany.mockResolvedValue({ count: 3 });
      prisma.audioCapture.deleteMany.mockResolvedValue({ count: 2 });
      prisma.encounter.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.requestErasure(physicianId);

      expect(prisma.encounterAttachment.deleteMany).toHaveBeenCalledWith({
        where: { encounter: { physicianId } },
      });
      expect(prisma.audioCapture.deleteMany).toHaveBeenCalledWith({
        where: { encounter: { physicianId } },
      });
      expect(result.erased).toMatchObject({ encounterAttachments: 3, audioCaptures: 2 });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DATA_ERASURE',
          payload: expect.objectContaining({
            erased: expect.objectContaining({ encounterAttachments: 3, audioCaptures: 2 }),
          }),
        }),
      );
    });

    it('deletes stored document PDFs before touching the database', async () => {
      prisma.document.findMany.mockResolvedValue([
        { pdfObjectKey: 'documents/enc-1/doc-1.pdf' },
        { pdfObjectKey: 'documents/enc-2/doc-2.pdf' },
      ]);

      const result = await service.requestErasure(physicianId);

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: { encounter: { physicianId }, pdfObjectKey: { not: null } },
        select: { pdfObjectKey: true },
      });
      expect(storage.deleteObjects).toHaveBeenCalledWith([
        'documents/enc-1/doc-1.pdf',
        'documents/enc-2/doc-2.pdf',
      ]);
      expect(storage.deleteObjects.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0] ?? 0,
      );
      expect(result.erased.storageObjects).toBe(2);
    });

    it('erases nothing in the database when stored PDFs cannot be deleted, so the request can be retried', async () => {
      prisma.document.findMany.mockResolvedValue([{ pdfObjectKey: 'documents/enc-1/doc-1.pdf' }]);
      storage.deleteObjects.mockRejectedValue(new Error('MinIO unreachable'));

      await expect(service.requestErasure(physicianId)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.physician.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('never mutates the append-only audit log', async () => {
      await service.requestErasure(physicianId);

      expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.updateMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing physician', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.requestErasure(physicianId)).rejects.toThrow(NotFoundException);
      expect(storage.deleteObjects).not.toHaveBeenCalled();
    });
  });
});
