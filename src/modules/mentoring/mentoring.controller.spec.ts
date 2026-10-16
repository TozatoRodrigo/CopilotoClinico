import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import {
  EncounterMentoringController,
  MentorQueueController,
  MentoringAdminController,
  MentoringController,
} from './mentoring.controller';
import { MentoringService } from './mentoring.service';
import { MentoringAdminService } from './mentoring-admin.service';
import { MENTORING_TERMS } from './mentoring-terms';

const physicianId = '11111111-1111-4111-8111-111111111111';
const mentorId = '22222222-2222-4222-8222-222222222222';
const encounterId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

/** JwtAuthGuard simulado com o usuário do header; os demais guards são os REAIS. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    request.user = JSON.parse(request.headers['x-test-user'] ?? '{}');
    return true;
  }
}

function asUser(id: string, role = 'PHYSICIAN') {
  return { 'x-test-user': JSON.stringify({ physicianId: id, role }) };
}

const createBody = {
  termsVersion: MENTORING_TERMS.version,
  acknowledgedNotUrgent: true,
  question: 'Vale anticoagular?',
};

describe('Mentoring controllers (HTTP)', () => {
  let app: NestFastifyApplication;
  const flags: Record<string, string> = {};
  const mentoring = {
    getConfig: vi.fn(),
    notifications: vi.fn(),
    cancel: vi.fn(),
    rate: vi.fn(),
    markAnswerSeen: vi.fn(),
    listForEncounter: vi.fn(),
    create: vi.fn(),
    queue: vi.fn(),
    detailForMentor: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
    answer: vi.fn(),
  };
  const admin = { overview: vi.fn() };
  const prisma = { physician: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        MentoringController,
        EncounterMentoringController,
        MentorQueueController,
        MentoringAdminController,
      ],
      providers: [
        { provide: MentoringService, useValue: mentoring },
        { provide: MentoringAdminService, useValue: admin },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => flags[key] } },
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
    flags.COPILOT_MENTORING = 'on';
    for (const fn of Object.values(mentoring)) fn.mockReset().mockResolvedValue({ ok: true });
    admin.overview.mockReset().mockResolvedValue({ metrics: {}, items: [] });
    prisma.physician.findUnique.mockReset().mockResolvedValue({ isMentor: false });
  });

  describe('COPILOT_MENTORING off: nothing exists but the config', () => {
    beforeEach(() => {
      flags.COPILOT_MENTORING = 'off';
      prisma.physician.findUnique.mockResolvedValue({ isMentor: true });
    });

    it('still answers GET /mentoring/config so the screen can hide the button', async () => {
      mentoring.getConfig.mockResolvedValue({ enabled: false });
      const res = await app.inject({
        method: 'GET',
        url: '/mentoring/config',
        headers: asUser(physicianId),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ enabled: false });
    });

    it.each([
      ['GET', `/encounters/${encounterId}/mentoring`],
      ['POST', `/encounters/${encounterId}/mentoring`],
      ['GET', '/mentoring/notifications'],
      ['POST', `/mentoring/requests/${requestId}/cancel`],
      ['GET', '/mentoring/queue'],
      ['POST', `/mentoring/queue/${requestId}/answer`],
    ] as const)('%s %s → 404, even for a mentor', async (method, url) => {
      const res = await app.inject({ method, url, headers: asUser(mentorId), payload: createBody });
      expect(res.statusCode).toBe(404);
    });

    it('hides the admin panel too', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mentoring',
        headers: asUser(physicianId, 'ADMIN'),
      });
      expect(res.statusCode).toBe(404);
      expect(admin.overview).not.toHaveBeenCalled();
    });
  });

  describe('POST /encounters/:id/mentoring (contract)', () => {
    it('creates the request for the authenticated physician', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/encounters/${encounterId}/mentoring`,
        headers: asUser(physicianId),
        payload: createBody,
      });
      expect(res.statusCode).toBe(201);
      expect(mentoring.create).toHaveBeenCalledWith(physicianId, encounterId, createBody);
    });

    it.each([
      ['without the "not urgent" acknowledgement', { ...createBody, acknowledgedNotUrgent: false }],
      ['without a terms version', { acknowledgedNotUrgent: true }],
      ['with a question over the limit', { ...createBody, question: 'x'.repeat(1001) }],
    ])('refuses a body %s', async (_label, payload) => {
      const res = await app.inject({
        method: 'POST',
        url: `/encounters/${encounterId}/mentoring`,
        headers: asUser(physicianId),
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(mentoring.create).not.toHaveBeenCalled();
    });

    it('refuses a non-UUID encounter id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/encounters/not-a-uuid/mentoring',
        headers: asUser(physicianId),
        payload: createBody,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('rating (contract)', () => {
    it.each([0, 6, 3.5])('refuses satisfaction %s', async (satisfaction) => {
      const res = await app.inject({
        method: 'POST',
        url: `/mentoring/requests/${requestId}/rating`,
        headers: asUser(physicianId),
        payload: { satisfaction },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts 1 to 5 from the requester', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/mentoring/requests/${requestId}/rating`,
        headers: asUser(physicianId),
        payload: { satisfaction: 4 },
      });
      expect(res.statusCode).toBe(200);
      expect(mentoring.rate).toHaveBeenCalledWith(physicianId, requestId, { satisfaction: 4 });
    });
  });

  describe('mentor queue: only mentors', () => {
    it('refuses a physician without is_mentor, before reaching the service', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/mentoring/queue/${requestId}/answer`,
        headers: asUser(physicianId),
        payload: { answer: 'Eu faria assim.', termsVersion: MENTORING_TERMS.version },
      });
      expect(res.statusCode).toBe(403);
      expect(mentoring.answer).not.toHaveBeenCalled();
    });

    it('lets a mentor list the open queue by default', async () => {
      prisma.physician.findUnique.mockResolvedValue({ isMentor: true });
      const res = await app.inject({
        method: 'GET',
        url: '/mentoring/queue',
        headers: asUser(mentorId),
      });
      expect(res.statusCode).toBe(200);
      expect(mentoring.queue).toHaveBeenCalledWith(mentorId, { scope: 'open' });
    });

    it('validates the answer body', async () => {
      prisma.physician.findUnique.mockResolvedValue({ isMentor: true });
      const res = await app.inject({
        method: 'POST',
        url: `/mentoring/queue/${requestId}/answer`,
        headers: asUser(mentorId),
        payload: { answer: '   ', termsVersion: MENTORING_TERMS.version },
      });
      expect(res.statusCode).toBe(400);
      expect(mentoring.answer).not.toHaveBeenCalled();
    });

    it('passes a valid answer through with the mentor id from the token', async () => {
      prisma.physician.findUnique.mockResolvedValue({ isMentor: true });
      const res = await app.inject({
        method: 'POST',
        url: `/mentoring/queue/${requestId}/answer`,
        headers: asUser(mentorId),
        payload: { answer: 'Eu faria troponina seriada.', termsVersion: MENTORING_TERMS.version },
      });
      expect(res.statusCode).toBe(200);
      expect(mentoring.answer).toHaveBeenCalledWith(mentorId, requestId, {
        answer: 'Eu faria troponina seriada.',
        termsVersion: MENTORING_TERMS.version,
      });
    });
  });

  describe('admin panel', () => {
    it('refuses a physician', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mentoring',
        headers: asUser(physicianId),
      });
      expect(res.statusCode).toBe(403);
    });

    it('lets compliance read it, with a 30-day default period', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mentoring',
        headers: asUser(physicianId, 'COMPLIANCE'),
      });
      expect(res.statusCode).toBe(200);
      expect(admin.overview).toHaveBeenCalledWith({ days: 30 });
    });

    it('refuses a period outside 1–365 days', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mentoring?days=400',
        headers: asUser(physicianId, 'ADMIN'),
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
