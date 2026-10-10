import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RecommendationDecisionsController } from './recommendation-decisions.controller';
import { RecommendationDecisionsService } from './recommendation-decisions.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const encounterId = '22222222-2222-4222-8222-222222222222';
const interactionId = '33333333-3333-4333-8333-333333333333';

/** Simula o JwtAuthGuard: o médico vem SEMPRE do token, nunca do corpo. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    request.user = { physicianId, role: 'PHYSICIAN' };
    return true;
  }
}

describe('RecommendationDecisionsController (HTTP)', () => {
  let app: NestFastifyApplication;
  const service = { upsert: vi.fn(), list: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecommendationDecisionsController],
      providers: [{ provide: RecommendationDecisionsService, useValue: service }],
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
    service.upsert.mockReset().mockResolvedValue({ id: 'decision-1' });
    service.list.mockReset().mockResolvedValue([]);
  });

  it('keeps the JWT guard on the whole controller', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      RecommendationDecisionsController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  describe('PUT /encounters/:encounterId/copilot/decisions', () => {
    it('upserts on behalf of the authenticated physician, ignoring any physicianId in the body', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/encounters/${encounterId}/copilot/decisions`,
        payload: {
          interactionId,
          recommendationIndex: 0,
          decision: 'adopted',
          physicianId: '99999999-9999-4999-8999-999999999999',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(service.upsert).toHaveBeenCalledWith(physicianId, encounterId, {
        interactionId,
        recommendationIndex: 0,
        decision: 'adopted',
      });
    });

    it('rejects a non-UUID encounter id before touching the database', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/encounters/not-a-uuid/copilot/decisions',
        payload: { interactionId, recommendationIndex: 0, decision: 'adopted' },
      });

      expect(res.statusCode).toBe(400);
      expect(service.upsert).not.toHaveBeenCalled();
    });

    it('rejects an unknown decision value', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/encounters/${encounterId}/copilot/decisions`,
        payload: { interactionId, recommendationIndex: 0, decision: 'maybe' },
      });

      expect(res.statusCode).toBe(400);
      expect(service.upsert).not.toHaveBeenCalled();
    });

    it('rejects a negative recommendation index', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/encounters/${encounterId}/copilot/decisions`,
        payload: { interactionId, recommendationIndex: -1, decision: 'rejected' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /encounters/:encounterId/copilot/decisions', () => {
    it('lists decisions of one analysis for the authenticated physician', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/encounters/${encounterId}/copilot/decisions?interactionId=${interactionId}`,
      });

      expect(res.statusCode).toBe(200);
      expect(service.list).toHaveBeenCalledWith(physicianId, encounterId, interactionId);
    });

    it('requires the interactionId query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/encounters/${encounterId}/copilot/decisions`,
      });

      expect(res.statusCode).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    });
  });
});
