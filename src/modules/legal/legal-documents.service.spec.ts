import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createFakeLegalPrisma } from '../../../tests/helpers/fake-legal-prisma';
import type { AuditService } from '../audit/audit.service';
import { LEGAL_DOCUMENT_OUTDATED } from '../../shared/contracts/legal';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalDocumentOutdatedException } from './legal.errors';

// Catálogo de teste com duas versões dos termos: publicar a segunda é o que
// reabre o aceite. O catálogo real tem o próprio teste.
vi.mock('./legal-document-catalog', () => {
  const section = (text: string) => [{ heading: '1. Uso', paragraphs: [text] }];
  const drafts = [
    {
      type: 'terms_of_use',
      version: 'termos-v1',
      title: 'Termos',
      provisional: true,
      changeSummary: ['Primeira versão.'],
      sections: section('Texto 1.'),
    },
    {
      type: 'privacy_policy',
      version: 'politica-v1',
      title: 'Política',
      provisional: true,
      changeSummary: ['Primeira versão.'],
      sections: section('Política 1.'),
    },
    {
      type: 'terms_of_use',
      version: 'termos-v2',
      title: 'Termos',
      provisional: false,
      changeSummary: ['Cobre a mentoria.'],
      sections: section('Texto 2.'),
    },
  ];
  return {
    LEGAL_DOCUMENT_CATALOG: drafts,
    findLegalDocumentDraft: (type: string, version: string) =>
      drafts.find((draft) => draft.type === type && draft.version === version),
  };
});

const physicianId = '11111111-1111-4111-8111-111111111111';
const otherPhysicianId = '22222222-2222-4222-8222-222222222222';
const erasedPhysicianId = '33333333-3333-4333-8333-333333333333';
const adminId = '44444444-4444-4444-8444-444444444444';

describe('LegalDocumentsService (CC-905)', () => {
  let fake: ReturnType<typeof createFakeLegalPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let flag: string | undefined;
  let config: ConfigService;
  let service: LegalDocumentsService;

  beforeEach(() => {
    fake = createFakeLegalPrisma([
      { id: physicianId },
      { id: otherPhysicianId },
      { id: erasedPhysicianId, erased: true },
      { id: adminId },
    ]);
    audit = { log: vi.fn().mockResolvedValue({}) };
    flag = 'on';
    config = { get: vi.fn(() => flag) } as unknown as ConfigService;
    service = new LegalDocumentsService(
      fake.asPrismaService(),
      audit as unknown as AuditService,
      config,
    );
  });

  async function publishV1() {
    const terms = await service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' });
    const policy = await service.publish(adminId, {
      type: 'privacy_policy',
      version: 'politica-v1',
    });
    return { terms, policy };
  }

  describe('status and the gate check', () => {
    it('asks for nothing with the flag off, even with versions published', async () => {
      await publishV1();
      flag = undefined;

      expect(service.isGateEnabled()).toBe(false);
      await expect(service.status(physicianId)).resolves.toEqual({
        enabled: false,
        acceptanceRequired: false,
        pending: [],
      });
    });

    it('asks for nothing while no version is published', async () => {
      await expect(service.status(physicianId)).resolves.toEqual({
        enabled: true,
        acceptanceRequired: false,
        pending: [],
      });
      await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(false);
    });

    it('lists the current versions the physician has not accepted, with the text', async () => {
      const { terms, policy } = await publishV1();

      const status = await service.status(physicianId);

      expect(status.acceptanceRequired).toBe(true);
      expect(status.pending.map((document) => document.id)).toEqual([terms.id, policy.id]);
      expect(status.pending[0]).toMatchObject({
        type: 'terms_of_use',
        version: 'termos-v1',
        provisional: true,
        changeSummary: ['Primeira versão.'],
        sections: [{ heading: '1. Uso', paragraphs: ['Texto 1.'] }],
        previouslyAcceptedVersion: null,
      });
      expect(status.pending[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
      await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(true);
    });
  });

  describe('accept', () => {
    it('records each version once, audits it and releases the gate', async () => {
      const { terms, policy } = await publishV1();

      const status = await service.accept(physicianId, [terms.id, policy.id, terms.id]);

      expect(status).toEqual({ enabled: true, acceptanceRequired: false, pending: [] });
      expect(fake.acceptances).toHaveLength(2);
      expect(fake.acceptances[0]).toEqual({
        id: expect.any(String),
        physicianId,
        documentId: terms.id,
        acceptedAt: expect.any(Date),
      });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'LEGAL_DOCUMENT_ACCEPTED',
        entity: 'LegalDocument',
        entityId: terms.id,
        payload: { type: 'terms_of_use', version: 'termos-v1', contentHash: terms.contentHash },
      });
      await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(false);
      // Outro médico continua bloqueado.
      await expect(service.hasPendingAcceptance(otherPhysicianId)).resolves.toBe(true);
    });

    it('keeps the gate closed until every required type is accepted', async () => {
      const { terms } = await publishV1();

      const status = await service.accept(physicianId, [terms.id]);

      expect(status.acceptanceRequired).toBe(true);
      expect(status.pending.map((document) => document.type)).toEqual(['privacy_policy']);
    });

    it('is idempotent and does not audit a repeated acceptance', async () => {
      const { terms, policy } = await publishV1();
      await service.accept(physicianId, [terms.id, policy.id]);
      audit.log.mockClear();

      await service.accept(physicianId, [terms.id, policy.id]);

      expect(fake.acceptances).toHaveLength(2);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses a version that is no longer current with LEGAL_DOCUMENT_OUTDATED', async () => {
      const { terms } = await publishV1();
      await service.publish(adminId, { type: 'terms_of_use', version: 'termos-v2' });

      const refusal = service.accept(physicianId, [terms.id]);

      await expect(refusal).rejects.toBeInstanceOf(LegalDocumentOutdatedException);
      await expect(refusal).rejects.toMatchObject({
        response: { code: LEGAL_DOCUMENT_OUTDATED, statusCode: 409 },
      });
      expect(fake.acceptances).toHaveLength(0);
    });

    it('keeps the acceptance when the audit trail fails', async () => {
      const { terms, policy } = await publishV1();
      audit.log.mockRejectedValue(new Error('audit down'));

      const status = await service.accept(physicianId, [terms.id, policy.id]);

      expect(status.acceptanceRequired).toBe(false);
      expect(fake.acceptances).toHaveLength(2);
    });
  });

  describe('a new version reopens the gate', () => {
    it('asks again only for the type that changed, telling which version was accepted', async () => {
      const { terms, policy } = await publishV1();
      await service.accept(physicianId, [terms.id, policy.id]);

      const termsV2 = await service.publish(adminId, {
        type: 'terms_of_use',
        version: 'termos-v2',
      });

      await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(true);
      const status = await service.status(physicianId);
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0]).toMatchObject({
        id: termsV2.id,
        version: 'termos-v2',
        provisional: false,
        changeSummary: ['Cobre a mentoria.'],
        previouslyAcceptedVersion: 'termos-v1',
      });
    });
  });

  describe('current versions cache', () => {
    it('sees a version published by another API instance within 30 s', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-15T12:00:00.000Z'), toFake: ['Date'] });
      try {
        const otherInstance = new LegalDocumentsService(
          fake.asPrismaService(),
          audit as unknown as AuditService,
          config,
        );
        const { terms, policy } = await publishV1();
        await service.accept(physicianId, [terms.id, policy.id]);
        await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(false);

        await otherInstance.publish(adminId, { type: 'terms_of_use', version: 'termos-v2' });

        await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(false);
        vi.advanceTimersByTime(30_001);
        await expect(service.hasPendingAcceptance(physicianId)).resolves.toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('publish', () => {
    it('copies the catalog text with its hash and audits who published', async () => {
      const terms = await service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' });

      expect(fake.prisma.legalDocument.create).toHaveBeenCalledWith({
        data: {
          type: 'terms_of_use',
          version: 'termos-v1',
          title: 'Termos',
          sections: [{ heading: '1. Uso', paragraphs: ['Texto 1.'] }],
          changeSummary: ['Primeira versão.'],
          contentHash: terms.contentHash,
          provisional: true,
          publishedById: adminId,
        },
      });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: adminId,
        action: 'LEGAL_DOCUMENT_PUBLISHED',
        entity: 'LegalDocument',
        entityId: terms.id,
        payload: {
          type: 'terms_of_use',
          version: 'termos-v1',
          contentHash: terms.contentHash,
          provisional: true,
        },
      });
    });

    it('refuses a version that is not in the catalog', async () => {
      await expect(
        service.publish(adminId, { type: 'terms_of_use', version: 'inventada' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to publish the same version twice', async () => {
      await service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' });

      await expect(
        service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' }),
      ).rejects.toThrow('Esta versão já está publicada.');
    });

    it('refuses a catalog text that changed after the version was published', async () => {
      const terms = await service.publish(adminId, {
        type: 'terms_of_use',
        version: 'termos-v1',
      });
      const stored = fake.documents.find((document) => document.id === terms.id);
      if (stored) stored.contentHash = 'f'.repeat(64);

      await expect(
        service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' }),
      ).rejects.toThrow('O texto desta versão mudou depois de publicado');
    });

    it('turns a concurrent publish (unique violation) into a conflict', async () => {
      fake.prisma.legalDocument.findUnique.mockResolvedValueOnce(null);
      await service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' });
      fake.prisma.legalDocument.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.publish(adminId, { type: 'terms_of_use', version: 'termos-v1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('adminOverview', () => {
    it('reports the acceptance rate without erased accounts, history and drafts', async () => {
      const { terms, policy } = await publishV1();
      await service.accept(physicianId, [terms.id, policy.id]);
      await service.accept(otherPhysicianId, [terms.id]);
      await service.accept(erasedPhysicianId, [terms.id, policy.id]);

      const overview = await service.adminOverview();

      expect(overview.enabled).toBe(true);
      expect(overview.eligibleAccounts).toBe(3);
      expect(overview.fullyAccepted).toBe(1);
      const termsEntry = overview.types.find((entry) => entry.type === 'terms_of_use');
      expect(termsEntry?.label).toBe('Termos de Uso');
      expect(termsEntry?.current?.acceptance).toEqual({ accepted: 2, eligible: 3, percent: 66.7 });
      expect(termsEntry?.history.map((item) => item.version)).toEqual(['termos-v1']);
      expect(termsEntry?.drafts).toEqual([
        {
          version: 'termos-v2',
          title: 'Termos',
          provisional: false,
          contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          changeSummary: ['Cobre a mentoria.'],
        },
      ]);
      const policyEntry = overview.types.find((entry) => entry.type === 'privacy_policy');
      expect(policyEntry?.current?.acceptance).toEqual({ accepted: 1, eligible: 3, percent: 33.3 });
      expect(policyEntry?.drafts).toEqual([]);
    });

    it('has no fully-accepted count while nothing is published', async () => {
      flag = 'off';

      const overview = await service.adminOverview();

      expect(overview.enabled).toBe(false);
      expect(overview.fullyAccepted).toBeNull();
      expect(overview.types.map((entry) => entry.current)).toEqual([null, null]);
      expect(overview.types.map((entry) => entry.drafts.length)).toEqual([2, 1]);
    });
  });
});
