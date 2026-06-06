import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LgpdService } from './lgpd.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException } from '@nestjs/common';

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
      create: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
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
        create: vi.fn(),
      },
      refreshToken: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    service = new LgpdService(prisma as unknown as PrismaService);
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
      prisma.consent.create.mockResolvedValue(consent);

      const result = await service.grantConsent(physicianId, 'ai_processing');

      expect(prisma.consent.create).toHaveBeenCalledWith({
        data: { physicianId, scope: 'ai_processing' },
      });
      expect(result).toEqual(consent);
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
      expect(result.revokedAt).not.toBeNull();
    });

    it('throws NotFoundException when no active consent exists', async () => {
      prisma.consent.findFirst.mockResolvedValue(null);

      await expect(service.revokeConsent(physicianId, 'ai_processing')).rejects.toThrow(
        NotFoundException,
      );
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

      prisma.encounter.deleteMany.mockResolvedValue({ count: 2 });
      prisma.consent.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.physician.update.mockResolvedValue({
        ...physician,
        name: 'ERASED',
        email: `erased-${physicianId}@erased.com`,
        mfaSecret: null,
      });
      prisma.auditLog.create.mockResolvedValue({
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
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: physicianId,
          action: 'DATA_ERASURE',
          entity: 'Physician',
          entityId: physicianId,
          payload: { reason: 'LGPD Art. 18, VI - Data erasure request' },
        },
      });
    });

    it('throws NotFoundException for missing physician', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.requestErasure(physicianId)).rejects.toThrow(NotFoundException);
    });
  });
});
