import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { BetaController } from './beta.controller';
import { BetaAdminController } from './beta-admin.controller';
import { BetaInviteService } from './beta-invite.service';
import { BetaWaitlistService } from './beta-waitlist.service';
import { BetaParticipantService } from './beta-participant.service';
import { BetaActivationService } from './beta-activation.service';
import { BetaInviteRequiredException } from './beta.errors';

const adminId = '99999999-9999-4999-8999-999999999999';
const entryId = '33333333-3333-4333-8333-333333333333';

/**
 * Simula o JwtAuthGuard com o usuário do header `x-test-user` (JSON); sem o
 * header, recusa como o guard real. O RolesGuard é o REAL.
 */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const header = request.headers['x-test-user'];
    if (!header) return false;
    request.user = JSON.parse(header);
    return true;
  }
}

function asUser(role: string, physicianId = adminId) {
  return { 'x-test-user': JSON.stringify({ physicianId, role }) };
}

describe('Beta controllers (HTTP, CC-702)', () => {
  let app: NestFastifyApplication;
  const invites = {
    registrationStatus: vi.fn(),
    list: vi.fn(),
    createBatch: vi.fn(),
    revoke: vi.fn(),
  };
  const waitlist = { join: vi.fn(), list: vi.fn(), approve: vi.fn(), remove: vi.fn() };
  const participants = { me: vi.fn(), acceptTerms: vi.fn(), saveProfile: vi.fn() };
  const activation = { report: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BetaController, BetaAdminController],
      providers: [
        { provide: BetaInviteService, useValue: invites },
        { provide: BetaWaitlistService, useValue: waitlist },
        { provide: BetaParticipantService, useValue: participants },
        { provide: BetaActivationService, useValue: activation },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('público', () => {
    it('answers the registration status without a session', async () => {
      invites.registrationStatus.mockResolvedValue({ inviteRequired: true, invite: null });

      const res = await app.inject({ method: 'GET', url: '/beta/registration?code=k3mq-9xpt' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ inviteRequired: true, invite: null });
      expect(invites.registrationStatus).toHaveBeenCalledWith('k3mq-9xpt');
    });

    it('accepts the waitlist with explicit consent and answers 202', async () => {
      waitlist.join.mockResolvedValue({ status: 'received' });

      const res = await app.inject({
        method: 'POST',
        url: '/beta/waitlist',
        payload: { email: 'Dra.Ana@Example.com', contactConsent: true, profile: { uf: 'MG' } },
      });

      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ status: 'received' });
      expect(waitlist.join).toHaveBeenCalledWith(
        { email: 'dra.ana@example.com', contactConsent: true, profile: { uf: 'MG' } },
        expect.anything(),
      );
    });

    it('refuses the waitlist without consent', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/beta/waitlist',
        payload: { email: 'dra.ana@example.com', contactConsent: false },
      });
      expect(res.statusCode).toBe(400);
      expect(waitlist.join).not.toHaveBeenCalled();
    });

    it('keeps the 403 body with the code the web reads', async () => {
      invites.registrationStatus.mockRejectedValue(new BetaInviteRequiredException());
      const res = await app.inject({ method: 'GET', url: '/beta/registration' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'BETA_INVITE_REQUIRED' });
    });
  });

  describe('participante', () => {
    it('requires a session for the onboarding endpoints', async () => {
      const res = await app.inject({ method: 'GET', url: '/beta/me' });
      expect(res.statusCode).toBe(403);
      expect(participants.me).not.toHaveBeenCalled();
    });

    it('accepts the terms and saves the profile for the signed-in physician', async () => {
      participants.acceptTerms.mockResolvedValue({ participant: true });
      participants.saveProfile.mockResolvedValue({ participant: true });
      const headers = asUser('PHYSICIAN', 'physician-1');

      const terms = await app.inject({
        method: 'POST',
        url: '/beta/me/terms',
        headers,
        payload: { version: '2026-10-15-provisorio' },
      });
      expect(terms.statusCode).toBe(200);
      expect(participants.acceptTerms).toHaveBeenCalledWith(
        'physician-1',
        '2026-10-15-provisorio',
        expect.anything(),
      );

      const profile = {
        training: 'recem_formado',
        facilityType: 'upa_porte_1',
        uf: 'MG',
        cityType: 'interior',
      };
      const saved = await app.inject({
        method: 'PUT',
        url: '/beta/me/profile',
        headers,
        payload: profile,
      });
      expect(saved.statusCode).toBe(200);
      expect(participants.saveProfile).toHaveBeenCalledWith('physician-1', profile);

      const incomplete = await app.inject({
        method: 'PUT',
        url: '/beta/me/profile',
        headers,
        payload: { training: 'recem_formado' },
      });
      expect(incomplete.statusCode).toBe(400);
    });
  });

  describe('console admin', () => {
    it.each(['PHYSICIAN', 'COMPLIANCE'])('refuses %s on invites and the waitlist', async (role) => {
      for (const url of ['/admin/beta/invites', '/admin/beta/waitlist']) {
        const res = await app.inject({ method: 'GET', url, headers: asUser(role) });
        expect(res.statusCode).toBe(403);
      }
      expect(invites.list).not.toHaveBeenCalled();
      expect(waitlist.list).not.toHaveBeenCalled();
    });

    it('lets Compliance read the activation metric (counts only)', async () => {
      activation.report.mockResolvedValue({ days: 7 });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/beta/activation?days=7',
        headers: asUser('COMPLIANCE'),
      });
      expect(res.statusCode).toBe(200);
      expect(activation.report).toHaveBeenCalledWith(7);

      const physician = await app.inject({
        method: 'GET',
        url: '/admin/beta/activation',
        headers: asUser('PHYSICIAN'),
      });
      expect(physician.statusCode).toBe(403);
    });

    it('creates a batch for the admin and validates the limits', async () => {
      invites.createBatch.mockResolvedValue([{ id: 'invite-1' }]);
      const payload = { batchLabel: 'rede Ripardo', quantity: 10, maxUses: 1, validDays: 30 };

      const res = await app.inject({
        method: 'POST',
        url: '/admin/beta/invites',
        headers: asUser('ADMIN'),
        payload,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ invites: [{ id: 'invite-1' }] });
      expect(invites.createBatch).toHaveBeenCalledWith(adminId, payload);

      const tooMany = await app.inject({
        method: 'POST',
        url: '/admin/beta/invites',
        headers: asUser('ADMIN'),
        payload: { ...payload, quantity: 500 },
      });
      expect(tooMany.statusCode).toBe(400);
    });

    it('approves and deletes waitlist entries by id', async () => {
      waitlist.approve.mockResolvedValue({ entry: {}, invite: {} });
      waitlist.remove.mockResolvedValue(undefined);

      const approve = await app.inject({
        method: 'POST',
        url: `/admin/beta/waitlist/${entryId}/approve`,
        headers: asUser('ADMIN'),
        payload: { validDays: 7 },
      });
      expect(approve.statusCode).toBe(200);
      expect(waitlist.approve).toHaveBeenCalledWith(adminId, entryId, { validDays: 7 });

      const remove = await app.inject({
        method: 'DELETE',
        url: `/admin/beta/waitlist/${entryId}`,
        headers: asUser('ADMIN'),
      });
      expect(remove.statusCode).toBe(204);
      expect(waitlist.remove).toHaveBeenCalledWith(adminId, entryId);

      const badId = await app.inject({
        method: 'DELETE',
        url: '/admin/beta/waitlist/nao-e-uuid',
        headers: asUser('ADMIN'),
      });
      expect(badId.statusCode).toBe(400);
    });
  });
});
