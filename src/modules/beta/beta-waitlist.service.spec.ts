import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { BetaInviteService } from './beta-invite.service';
import { BetaWaitlistService, pickProfile } from './beta-waitlist.service';

const now = new Date('2026-10-15T12:00:00.000Z');
const adminId = '99999999-9999-4999-8999-999999999999';
const entryId = '33333333-3333-4333-8333-333333333333';

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    email: 'dra.ana@example.com',
    training: 'recem_formado',
    facilityType: 'upa_porte_1',
    uf: 'MG',
    cityType: null,
    contactConsentAt: new Date('2026-10-14T12:00:00.000Z'),
    status: 'waiting',
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    invites: [],
    ...overrides,
  };
}

function build() {
  const prisma = {
    physician: { findFirst: vi.fn().mockResolvedValue(null) },
    betaWaitlistEntry: {
      upsert: vi.fn().mockResolvedValue({ id: entryId }),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const audit = { log: vi.fn().mockResolvedValue({}) };
  const invites = { insertInvites: vi.fn() };
  const service = new BetaWaitlistService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    invites as unknown as BetaInviteService,
  );
  return { service, prisma, audit, invites };
}

describe('BetaWaitlistService (CC-702)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('join', () => {
    it('stores the email, the optional profile and the consent date', async () => {
      const { service, prisma, audit } = build();

      await expect(
        service.join(
          {
            email: 'dra.ana@example.com',
            contactConsent: true,
            profile: { training: 'recem_formado', uf: 'MG' },
          },
          '10.0.0.1',
        ),
      ).resolves.toEqual({ status: 'received' });

      expect(prisma.betaWaitlistEntry.upsert).toHaveBeenCalledWith({
        where: { email: 'dra.ana@example.com' },
        create: {
          email: 'dra.ana@example.com',
          training: 'recem_formado',
          uf: 'MG',
          contactConsentAt: now,
        },
        update: { training: 'recem_formado', uf: 'MG', contactConsentAt: now },
        select: { id: true },
      });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: 'anonymous',
        action: 'BETA_WAITLIST_JOINED',
        entity: 'BetaWaitlistEntry',
        entityId: entryId,
        payload: { profileFields: ['training', 'uf'] },
        ip: '10.0.0.1',
      });
      // Nada do e-mail na trilha.
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('example.com');
    });

    it('answers the same and stores nothing when the email already has an account', async () => {
      const { service, prisma, audit } = build();
      prisma.physician.findFirst.mockResolvedValue({ id: 'physician-1' });

      await expect(
        service.join({ email: 'dra.ana@example.com', contactConsent: true }),
      ).resolves.toEqual({ status: 'received' });

      expect(prisma.physician.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'dra.ana@example.com', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(prisma.betaWaitlistEntry.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('treats a simultaneous duplicate as received', async () => {
      const { service, prisma } = build();
      prisma.betaWaitlistEntry.upsert.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );
      await expect(
        service.join({ email: 'dra.ana@example.com', contactConsent: true }),
      ).resolves.toEqual({ status: 'received' });
    });
  });

  describe('list', () => {
    it('lists entries with their latest invite and counts by status', async () => {
      const { service, prisma } = build();
      prisma.betaWaitlistEntry.findMany.mockResolvedValue([entryRow()]);
      prisma.betaWaitlistEntry.groupBy.mockResolvedValue([
        { status: 'waiting', _count: { _all: 3 } },
        { status: 'registered', _count: { _all: 1 } },
      ]);

      const result = await service.list({ status: 'waiting' });

      expect(prisma.betaWaitlistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'waiting' } }),
      );
      expect(result.counts).toEqual({ waiting: 3, invited: 0, registered: 1 });
      expect(result.entries[0]).toMatchObject({
        id: entryId,
        email: 'dra.ana@example.com',
        profile: { training: 'recem_formado', facilityType: 'upa_porte_1', uf: 'MG' },
        status: 'waiting',
        invite: null,
      });
    });
  });

  describe('approve', () => {
    it('generates a single-use invite tied to the entry and marks it invited', async () => {
      const { service, prisma, invites, audit } = build();
      const invite = {
        id: 'invite-1',
        code: 'K3MQ9XPT',
        batchLabel: 'lista de espera',
        maxUses: 1,
        usesCount: 0,
        expiresAt: new Date('2026-10-29T12:00:00.000Z'),
        revokedAt: null,
        createdById: adminId,
        waitlistEntryId: entryId,
        createdAt: now,
      };
      prisma.betaWaitlistEntry.findUnique.mockResolvedValue(entryRow());
      invites.insertInvites.mockResolvedValue([invite]);
      prisma.betaWaitlistEntry.update.mockResolvedValue(
        entryRow({ status: 'invited', invites: [{ ...invite, participants: [] }] }),
      );

      const result = await service.approve(adminId, entryId, {});

      expect(invites.insertInvites).toHaveBeenCalledWith(
        {
          batchLabel: 'lista de espera',
          maxUses: 1,
          expiresAt: new Date('2026-10-29T12:00:00.000Z'),
          createdById: adminId,
          waitlistEntryId: entryId,
        },
        1,
      );
      expect(prisma.betaWaitlistEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: entryId }, data: { status: 'invited' } }),
      );
      expect(result.invite).toMatchObject({ code: 'K3MQ-9XPT', maxUses: 1, fromWaitlist: true });
      expect(result.entry.status).toBe('invited');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BETA_WAITLIST_APPROVED',
          entityId: entryId,
          payload: { inviteId: 'invite-1', batchLabel: 'lista de espera', validDays: 14 },
        }),
      );
    });

    it('uses the batch label and validity the admin chose', async () => {
      const { service, prisma, invites } = build();
      prisma.betaWaitlistEntry.findUnique.mockResolvedValue(entryRow());
      invites.insertInvites.mockResolvedValue([
        { id: 'invite-1', code: 'K3MQ9XPT', waitlistEntryId: entryId, createdAt: now },
      ]);
      prisma.betaWaitlistEntry.update.mockResolvedValue(entryRow({ status: 'invited' }));

      await service
        .approve(adminId, entryId, { batchLabel: 'rede Luiz', validDays: 3 })
        .catch(() => undefined);

      expect(invites.insertInvites).toHaveBeenCalledWith(
        expect.objectContaining({
          batchLabel: 'rede Luiz',
          expiresAt: new Date('2026-10-18T12:00:00.000Z'),
        }),
        1,
      );
    });

    it('refuses someone who already registered and 404s an unknown entry', async () => {
      const { service, prisma, invites } = build();
      prisma.betaWaitlistEntry.findUnique.mockResolvedValueOnce(entryRow({ status: 'registered' }));
      await expect(service.approve(adminId, entryId, {})).rejects.toThrow(ConflictException);

      prisma.betaWaitlistEntry.findUnique.mockResolvedValueOnce(null);
      await expect(service.approve(adminId, entryId, {})).rejects.toThrow(NotFoundException);
      expect(invites.insertInvites).not.toHaveBeenCalled();
    });
  });

  describe('remove (pedido da pessoa)', () => {
    it('deletes the entry and audits only its id', async () => {
      const { service, prisma, audit } = build();
      prisma.betaWaitlistEntry.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(adminId, entryId);

      expect(prisma.betaWaitlistEntry.deleteMany).toHaveBeenCalledWith({ where: { id: entryId } });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: adminId,
        action: 'BETA_WAITLIST_DELETED',
        entity: 'BetaWaitlistEntry',
        entityId: entryId,
        payload: { reason: 'data_subject_request' },
      });
    });

    it('404s an entry that is no longer there', async () => {
      const { service, prisma } = build();
      prisma.betaWaitlistEntry.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(adminId, entryId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('pickProfile', () => {
    it('keeps only the fields that came and are valid', () => {
      expect(pickProfile({ training: 'em_residencia', uf: null, cityType: undefined })).toEqual({
        training: 'em_residencia',
      });
      expect(pickProfile({ facilityType: 'hospital_de_campanha' })).toEqual({});
    });
  });
});
