import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { BETA_INVITE_INVALID, BETA_INVITE_REQUIRED } from '../../shared/contracts/beta';
import { BetaInviteService, type BetaAdmission } from './beta-invite.service';
import { BetaInviteInvalidException, BetaInviteRequiredException } from './beta.errors';

const now = new Date('2026-10-15T12:00:00.000Z');
const adminId = '99999999-9999-4999-8999-999999999999';
const inviteId = '11111111-1111-4111-8111-111111111111';
const physicianId = '22222222-2222-4222-8222-222222222222';

function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: inviteId,
    code: 'K3MQ9XPT',
    batchLabel: 'rede Ripardo',
    maxUses: 1,
    usesCount: 0,
    expiresAt: new Date('2026-11-14T12:00:00.000Z'),
    revokedAt: null,
    createdById: adminId,
    waitlistEntryId: null,
    createdAt: new Date('2026-10-15T09:00:00.000Z'),
    ...overrides,
  };
}

function buildDb() {
  const delegates = () => ({
    betaInvite: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      createManyAndReturn: vi.fn(),
      fields: { maxUses: { modelName: 'BetaInvite', name: 'maxUses' } },
    },
    betaParticipant: { create: vi.fn().mockResolvedValue({}) },
    betaWaitlistEntry: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    physician: { create: vi.fn() },
  });
  const tx = delegates();
  const prisma = {
    ...delegates(),
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { prisma, tx };
}

function build(flag?: string) {
  const { prisma, tx } = buildDb();
  const audit = { log: vi.fn().mockResolvedValue({}) };
  const config = new ConfigService(flag === undefined ? {} : { BETA_INVITE_REQUIRED: flag });
  const service = new BetaInviteService(
    prisma as unknown as PrismaService,
    config,
    audit as unknown as AuditService,
  );
  return { service, prisma, tx, audit };
}

const account = { id: physicianId, email: 'Dra.Ana@Example.com' };

describe('BetaInviteService (CC-702)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('admit', () => {
    it('keeps registration open without a code while the flag is off (default)', async () => {
      const { service, prisma } = build();
      await expect(service.admit(undefined)).resolves.toEqual({ kind: 'open' });
      await expect(service.admit('  ')).resolves.toEqual({ kind: 'open' });
      expect(prisma.betaInvite.findUnique).not.toHaveBeenCalled();
    });

    it('refuses registration without a code when BETA_INVITE_REQUIRED is on', async () => {
      const { service } = build('on');
      const error = await service.admit(undefined).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BetaInviteRequiredException);
      expect((error as BetaInviteRequiredException).getResponse()).toMatchObject({
        statusCode: 403,
        code: BETA_INVITE_REQUIRED,
      });
    });

    it('treats an unrecognized flag value as off', async () => {
      const { service } = build('talvez');
      await expect(service.admit(undefined)).resolves.toEqual({ kind: 'open' });
    });

    it('admits a valid code typed in any case and with the hyphen', async () => {
      const { service, prisma } = build('on');
      prisma.betaInvite.findUnique.mockResolvedValue(inviteRow({ waitlistEntryId: 'wl-1' }));

      await expect(service.admit(' k3mq-9xpt ')).resolves.toEqual({
        kind: 'invite',
        inviteId,
        batchLabel: 'rede Ripardo',
        waitlistEntryId: 'wl-1',
      });
      expect(prisma.betaInvite.findUnique).toHaveBeenCalledWith({ where: { code: 'K3MQ9XPT' } });
    });

    it.each([
      ['not_found', null],
      ['revoked', inviteRow({ revokedAt: new Date('2026-10-14T00:00:00.000Z') })],
      ['expired', inviteRow({ expiresAt: new Date('2026-10-15T11:59:59.000Z') })],
      ['exhausted', inviteRow({ usesCount: 1 })],
    ])('refuses a %s code, even with the flag off', async (reason, row) => {
      const { service, prisma } = build();
      prisma.betaInvite.findUnique.mockResolvedValue(row);

      const error = await service.admit('K3MQ-9XPT').catch((err: unknown) => err);

      expect(error).toBeInstanceOf(BetaInviteInvalidException);
      expect((error as BetaInviteInvalidException).getResponse()).toMatchObject({
        statusCode: 403,
        code: BETA_INVITE_INVALID,
        reason,
      });
    });
  });

  describe('createAccount', () => {
    const admission: BetaAdmission = {
      kind: 'invite',
      inviteId,
      batchLabel: 'rede Ripardo',
      waitlistEntryId: null,
    };

    it('creates an open account outside any transaction and touches no invite', async () => {
      const { service, prisma } = build();
      const create = vi.fn().mockResolvedValue(account);

      await expect(service.createAccount({ kind: 'open' }, create)).resolves.toBe(account);

      expect(create).toHaveBeenCalledWith(prisma);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.betaInvite.updateMany).not.toHaveBeenCalled();
    });

    it('creates the account, claims one use and enrolls the participant in one transaction', async () => {
      const { service, prisma, tx, audit } = build('on');
      const create = vi.fn().mockResolvedValue(account);

      await expect(service.createAccount(admission, create, '10.0.0.1')).resolves.toBe(account);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(tx);
      // O banco decide quem leva o último uso: UPDATE condicional com o
      // limite comparado à própria coluna max_uses.
      expect(tx.betaInvite.updateMany).toHaveBeenCalledWith({
        where: {
          id: inviteId,
          revokedAt: null,
          expiresAt: { gt: now },
          usesCount: { lt: tx.betaInvite.fields.maxUses },
        },
        data: { usesCount: { increment: 1 } },
      });
      expect(tx.betaParticipant.create).toHaveBeenCalledWith({
        data: { physicianId, inviteId },
      });
      expect(tx.betaWaitlistEntry.updateMany).toHaveBeenCalledWith({
        where: { status: { not: 'registered' }, OR: [{ email: 'dra.ana@example.com' }] },
        data: { status: 'registered' },
      });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'BETA_INVITE_REDEEMED',
        entity: 'BetaInvite',
        entityId: inviteId,
        payload: { batchLabel: 'rede Ripardo' },
        ip: '10.0.0.1',
      });
      // Trilha sem dado pessoal além do padrão: nada de e-mail no payload.
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('example.com');
    });

    it('marks the approved waitlist entry as registered even under another email', async () => {
      const { service, tx } = build('on');
      await service.createAccount(
        { ...admission, waitlistEntryId: 'wl-1' },
        vi.fn().mockResolvedValue(account),
      );
      expect(tx.betaWaitlistEntry.updateMany).toHaveBeenCalledWith({
        where: {
          status: { not: 'registered' },
          OR: [{ email: 'dra.ana@example.com' }, { id: 'wl-1' }],
        },
        data: { status: 'registered' },
      });
    });

    it('aborts the registration when another sign-up took the last use first', async () => {
      const { service, tx, audit } = build('on');
      tx.betaInvite.updateMany.mockResolvedValue({ count: 0 });
      tx.betaInvite.findUnique.mockResolvedValue(inviteRow({ usesCount: 1 }));

      const error = await service
        .createAccount(admission, vi.fn().mockResolvedValue(account))
        .catch((err: unknown) => err);

      // A exceção dentro do $transaction desfaz a conta criada.
      expect(error).toBeInstanceOf(BetaInviteInvalidException);
      expect((error as BetaInviteInvalidException).reason).toBe('exhausted');
      expect(tx.betaParticipant.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('aborts with "revoked" when the admin revoked between the check and the claim', async () => {
      const { service, tx } = build('on');
      tx.betaInvite.updateMany.mockResolvedValue({ count: 0 });
      tx.betaInvite.findUnique.mockResolvedValue(inviteRow({ revokedAt: now }));

      await expect(
        service.createAccount(admission, vi.fn().mockResolvedValue(account)),
      ).rejects.toMatchObject({ reason: 'revoked' });
    });

    it('still returns the account when the audit write fails', async () => {
      const { service, audit } = build('on');
      audit.log.mockRejectedValue(new Error('chain busy'));
      await expect(
        service.createAccount(admission, vi.fn().mockResolvedValue(account)),
      ).resolves.toBe(account);
    });
  });

  describe('registrationStatus', () => {
    it('reports whether an invite is required and never the batch', async () => {
      const { service, prisma } = build('on');
      prisma.betaInvite.findUnique.mockResolvedValue(inviteRow());

      await expect(service.registrationStatus(undefined)).resolves.toEqual({
        inviteRequired: true,
        invite: null,
      });
      const status = await service.registrationStatus('k3mq9xpt');
      expect(status).toEqual({ inviteRequired: true, invite: { valid: true } });
      expect(JSON.stringify(status)).not.toContain('Ripardo');
    });

    it('explains why a code does not work', async () => {
      const { service, prisma } = build();
      prisma.betaInvite.findUnique.mockResolvedValueOnce(null);
      prisma.betaInvite.findUnique.mockResolvedValueOnce(inviteRow({ usesCount: 1 }));

      await expect(service.registrationStatus('ZZZZ-ZZZZ')).resolves.toEqual({
        inviteRequired: false,
        invite: { valid: false, reason: 'not_found' },
      });
      await expect(service.registrationStatus('K3MQ-9XPT')).resolves.toEqual({
        inviteRequired: false,
        invite: { valid: false, reason: 'exhausted' },
      });
    });
  });

  describe('createBatch', () => {
    it('creates distinct codes with the batch label, limit and validity', async () => {
      const { service, prisma, audit } = build();
      prisma.betaInvite.createManyAndReturn.mockImplementation(
        ({ data }: { data: { code: string }[] }) =>
          Promise.resolve(data.map((row, i) => inviteRow({ ...row, id: `id-${i}` }))),
      );

      const invites = await service.createBatch(adminId, {
        batchLabel: 'base ANY',
        quantity: 5,
        maxUses: 3,
        validDays: 10,
      });

      const { data } = prisma.betaInvite.createManyAndReturn.mock.calls[0]![0] as {
        data: { code: string; batchLabel: string; maxUses: number; expiresAt: Date }[];
      };
      expect(data).toHaveLength(5);
      expect(new Set(data.map((row) => row.code)).size).toBe(5);
      expect(data[0]).toMatchObject({
        batchLabel: 'base ANY',
        maxUses: 3,
        createdById: adminId,
        expiresAt: new Date('2026-10-25T12:00:00.000Z'),
      });
      expect(invites).toHaveLength(5);
      expect(invites[0]!.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(invites[0]!.uses).toEqual([]);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BETA_INVITES_CREATED',
          actorId: adminId,
          payload: expect.objectContaining({ batchLabel: 'base ANY', quantity: 5, maxUses: 3 }),
        }),
      );
    });

    it('draws new codes when one collides with an existing invite', async () => {
      const { service, prisma } = build();
      const collision = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.betaInvite.createManyAndReturn
        .mockRejectedValueOnce(collision)
        .mockResolvedValueOnce([inviteRow()]);

      await service.createBatch(adminId, {
        batchLabel: 'rede Luiz',
        quantity: 1,
        maxUses: 1,
        validDays: 30,
      });

      expect(prisma.betaInvite.createManyAndReturn).toHaveBeenCalledTimes(2);
    });
  });

  describe('revoke', () => {
    it('revokes once and keeps the first revocation date', async () => {
      const { service, prisma, audit } = build();
      prisma.betaInvite.findUnique.mockResolvedValueOnce({ ...inviteRow(), participants: [] });
      prisma.betaInvite.update.mockResolvedValue({
        ...inviteRow({ revokedAt: now }),
        participants: [],
      });

      const view = await service.revoke(adminId, inviteId);
      expect(view.status).toBe('revoked');
      expect(prisma.betaInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: inviteId }, data: { revokedAt: now } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BETA_INVITE_REVOKED', entityId: inviteId }),
      );

      prisma.betaInvite.findUnique.mockResolvedValueOnce({
        ...inviteRow({ revokedAt: new Date('2026-10-01T00:00:00.000Z') }),
        participants: [],
      });
      const again = await service.revoke(adminId, inviteId);
      expect(again.revokedAt).toBe('2026-10-01T00:00:00.000Z');
      expect(prisma.betaInvite.update).toHaveBeenCalledTimes(1);
    });

    it('404s an unknown invite', async () => {
      const { service, prisma } = build();
      prisma.betaInvite.findUnique.mockResolvedValue(null);
      await expect(service.revoke(adminId, inviteId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('shows each invite with status and uses, and the totals per batch', async () => {
      const { service, prisma } = build();
      prisma.betaInvite.findMany.mockResolvedValue([
        {
          ...inviteRow({ usesCount: 1 }),
          participants: [
            {
              joinedAt: new Date('2026-10-15T10:00:00.000Z'),
              physician: { id: physicianId, name: 'Dra. Ana', email: 'ana@example.com' },
            },
          ],
        },
        { ...inviteRow({ id: 'other', code: 'ABCDEFGH', maxUses: 20 }), participants: [] },
      ]);
      prisma.betaInvite.groupBy.mockResolvedValue([
        { batchLabel: 'rede Ripardo', _count: { _all: 2 }, _sum: { usesCount: 1 } },
      ]);

      const result = await service.list();

      expect(result.invites.map((invite) => invite.status)).toEqual(['exhausted', 'active']);
      expect(result.invites[0]!.uses).toEqual([
        {
          physicianId,
          name: 'Dra. Ana',
          email: 'ana@example.com',
          joinedAt: '2026-10-15T10:00:00.000Z',
        },
      ]);
      expect(result.invites[1]!.code).toBe('ABCD-EFGH');
      expect(result.batches).toEqual([{ batchLabel: 'rede Ripardo', invites: 2, uses: 1 }]);
    });
  });
});
