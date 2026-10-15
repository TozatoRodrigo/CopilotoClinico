import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PrismaService } from '../../../config/prisma.service';
import { CopilotFeedbackTriageController } from './copilot-feedback-triage.controller';
import { CopilotFeedbackService } from './copilot-feedback.service';

const curatorId = '44444444-4444-4444-8444-444444444444';
const feedbackId = '55555555-5555-4555-8555-555555555555';

/**
 * Simula o JwtAuthGuard com o usuário do header `x-test-user` (JSON). Os
 * guards de papel e de curadoria são os REAIS — é o que este teste protege.
 */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    request.user = JSON.parse(request.headers['x-test-user'] ?? '{}');
    return true;
  }
}

function asUser(role: string, physicianId = curatorId) {
  return { 'x-test-user': JSON.stringify({ physicianId, role }) };
}

describe('CopilotFeedbackTriageController (HTTP)', () => {
  let app: NestFastifyApplication;
  const service = { listForTriage: vi.fn(), updateTriage: vi.fn() };
  const prisma = { physician: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CopilotFeedbackTriageController],
      providers: [
        { provide: CopilotFeedbackService, useValue: service },
        { provide: PrismaService, useValue: prisma },
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
    service.listForTriage
      .mockReset()
      .mockResolvedValue({ items: [], total: 0, countsByStatus: {} });
    service.updateTriage.mockReset().mockResolvedValue({ id: feedbackId });
    prisma.physician.findUnique.mockReset().mockResolvedValue({ isCurator: true });
  });

  describe('roles', () => {
    it('refuses a physician without an admin role, even if curator', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/copilot-feedback',
        headers: asUser('PHYSICIAN'),
      });

      expect(res.statusCode).toBe(403);
      expect(service.listForTriage).not.toHaveBeenCalled();
    });

    it('refuses compliance/admin users who are not clinical curators', async () => {
      prisma.physician.findUnique.mockResolvedValue({ isCurator: false });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/copilot-feedback',
        headers: asUser('ADMIN'),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<{ message: string }>().message).toBe(
        'Apenas curadores clínicos podem acessar esta área',
      );
      expect(service.listForTriage).not.toHaveBeenCalled();
    });

    it('lets a compliance curator list the queue with default pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/copilot-feedback',
        headers: asUser('COMPLIANCE'),
      });

      expect(res.statusCode).toBe(200);
      expect(service.listForTriage).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    });
  });

  describe('GET /admin/copilot-feedback', () => {
    it('passes the status filter and pagination through', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/copilot-feedback?status=new&kind=missing_coverage&limit=10&offset=30',
        headers: asUser('ADMIN'),
      });

      expect(res.statusCode).toBe(200);
      expect(service.listForTriage).toHaveBeenCalledWith({
        status: 'new',
        kind: 'missing_coverage',
        limit: 10,
        offset: 30,
      });
    });

    it('rejects an unknown status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/copilot-feedback?status=closed',
        headers: asUser('ADMIN'),
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /admin/copilot-feedback/:id', () => {
    it('records the triage as the authenticated curator', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/copilot-feedback/${feedbackId}`,
        headers: asUser('ADMIN'),
        payload: { status: 'converted_to_eval_case', triageNote: 'campo-ab12' },
      });

      expect(res.statusCode).toBe(200);
      expect(service.updateTriage).toHaveBeenCalledWith(curatorId, feedbackId, {
        status: 'converted_to_eval_case',
        triageNote: 'campo-ab12',
      });
    });

    it('rejects a non-UUID feedback id', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/admin/copilot-feedback/42',
        headers: asUser('ADMIN'),
        payload: { status: 'triaged' },
      });

      expect(res.statusCode).toBe(400);
      expect(service.updateTriage).not.toHaveBeenCalled();
    });

    it('rejects an unknown status', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/copilot-feedback/${feedbackId}`,
        headers: asUser('ADMIN'),
        payload: { status: 'closed' },
      });

      expect(res.statusCode).toBe(400);
      expect(service.updateTriage).not.toHaveBeenCalled();
    });
  });
});
