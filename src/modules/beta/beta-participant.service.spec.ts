import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { BETA_TERMS } from '../../shared/contracts/beta';
import { BetaParticipantService, toBetaMe } from './beta-participant.service';

const physicianId = '22222222-2222-4222-8222-222222222222';

function participantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'participant-1',
    physicianId,
    inviteId: 'invite-1',
    joinedAt: new Date('2026-10-15T10:00:00.000Z'),
    termsVersion: null,
    termsAcceptedAt: null,
    training: null,
    facilityType: null,
    uf: null,
    cityType: null,
    profileUpdatedAt: null,
    ...overrides,
  };
}

const profile = {
  training: 'sem_residencia',
  facilityType: 'upa_porte_2',
  uf: 'BA',
  cityType: 'interior',
} as const;

function build() {
  const prisma = { betaParticipant: { findUnique: vi.fn(), update: vi.fn() } };
  const audit = { log: vi.fn().mockResolvedValue({}) };
  const service = new BetaParticipantService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

describe('BetaParticipantService (CC-702)', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  describe('toBetaMe', () => {
    it('says a non-invited account is not a participant', () => {
      expect(toBetaMe(null)).toEqual({ participant: false });
    });

    it('needs onboarding until the current terms are accepted and the profile is complete', () => {
      expect(toBetaMe(participantRow() as never)).toMatchObject({
        participant: true,
        needsOnboarding: true,
        profile: null,
        terms: { currentVersion: BETA_TERMS.version, acceptedVersion: null, upToDate: false },
      });

      const accepted = participantRow({
        termsVersion: BETA_TERMS.version,
        termsAcceptedAt: new Date('2026-10-15T10:01:00.000Z'),
      });
      expect(toBetaMe(accepted as never)).toMatchObject({ needsOnboarding: true });

      const done = participantRow({
        termsVersion: BETA_TERMS.version,
        termsAcceptedAt: new Date('2026-10-15T10:01:00.000Z'),
        ...profile,
      });
      expect(toBetaMe(done as never)).toMatchObject({
        needsOnboarding: false,
        profile,
        terms: { upToDate: true, acceptedAt: '2026-10-15T10:01:00.000Z' },
      });
    });

    it('sends back to onboarding whoever accepted an older version of the terms', () => {
      const old = participantRow({
        termsVersion: '2026-09-01-provisorio',
        termsAcceptedAt: new Date('2026-09-01T10:00:00.000Z'),
        ...profile,
      });
      expect(toBetaMe(old as never)).toMatchObject({
        needsOnboarding: true,
        terms: { upToDate: false, acceptedVersion: '2026-09-01-provisorio' },
      });
    });
  });

  describe('acceptTerms', () => {
    it('records the current version and audits it with the provisional mark', async () => {
      ctx.prisma.betaParticipant.findUnique.mockResolvedValue(participantRow());
      ctx.prisma.betaParticipant.update.mockResolvedValue(
        participantRow({ termsVersion: BETA_TERMS.version, termsAcceptedAt: new Date() }),
      );

      const me = await ctx.service.acceptTerms(physicianId, BETA_TERMS.version, '10.0.0.1');

      expect(ctx.prisma.betaParticipant.update).toHaveBeenCalledWith({
        where: { physicianId },
        data: { termsVersion: BETA_TERMS.version, termsAcceptedAt: expect.any(Date) },
      });
      expect(me).toMatchObject({ terms: { upToDate: true } });
      expect(ctx.audit.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'BETA_TERMS_ACCEPTED',
        entity: 'BetaParticipant',
        entityId: 'participant-1',
        payload: { version: BETA_TERMS.version, provisional: true },
        ip: '10.0.0.1',
      });
    });

    it('refuses a version other than the current one (tab opened before a change)', async () => {
      await expect(ctx.service.acceptTerms(physicianId, '2026-09-01-provisorio')).rejects.toThrow(
        ConflictException,
      );
      expect(ctx.prisma.betaParticipant.update).not.toHaveBeenCalled();
    });

    it('404s an account that did not join through an invite', async () => {
      ctx.prisma.betaParticipant.findUnique.mockResolvedValue(null);
      await expect(ctx.service.acceptTerms(physicianId, BETA_TERMS.version)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveProfile', () => {
    it('stores the profile and audits only the field names', async () => {
      ctx.prisma.betaParticipant.findUnique.mockResolvedValue(participantRow());
      ctx.prisma.betaParticipant.update.mockResolvedValue(participantRow(profile));

      const me = await ctx.service.saveProfile(physicianId, profile);

      expect(ctx.prisma.betaParticipant.update).toHaveBeenCalledWith({
        where: { physicianId },
        data: { ...profile, profileUpdatedAt: expect.any(Date) },
      });
      expect(me).toMatchObject({ participant: true, profile });
      expect(ctx.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BETA_PROFILE_UPDATED',
          payload: { fields: ['training', 'facilityType', 'uf', 'cityType'] },
        }),
      );
      expect(JSON.stringify(ctx.audit.log.mock.calls)).not.toContain('BA');
    });
  });
});
