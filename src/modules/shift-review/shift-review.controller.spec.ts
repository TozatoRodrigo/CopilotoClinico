import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CalibrationMapService } from './calibration-map.service';
import { ShiftReviewController } from './shift-review.controller';
import { ShiftReviewService } from './shift-review.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const questionId = '50000000-0000-4000-8000-000000000001';

/** Simula o JwtAuthGuard: o médico vem SEMPRE do token. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    request.user = { physicianId, role: 'PHYSICIAN' };
    return true;
  }
}

describe('ShiftReviewController (HTTP)', () => {
  let app: NestFastifyApplication;
  const service = { getCurrent: vi.fn(), start: vi.fn(), answer: vi.fn() };
  const maps = { getMap: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ShiftReviewController],
      providers: [
        { provide: ShiftReviewService, useValue: service },
        { provide: CalibrationMapService, useValue: maps },
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
    service.getCurrent.mockReset().mockResolvedValue({ status: 'available' });
    service.start.mockReset().mockResolvedValue({ status: 'generating' });
    service.answer.mockReset().mockResolvedValue({ status: 'ready', review: {} });
    maps.getMap
      .mockReset()
      .mockResolvedValue({ status: 'insufficient', answered: 4, required: 20 });
  });

  it('keeps the JWT guard on the whole controller', () => {
    expect(Reflect.getMetadata('__guards__', ShiftReviewController)).toContain(JwtAuthGuard);
  });

  it('GET /shift-review/current reads the state of the authenticated physician', async () => {
    const res = await app.inject({ method: 'GET', url: '/shift-review/current' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'available' });
    expect(service.getCurrent).toHaveBeenCalledWith(physicianId);
  });

  it('POST /shift-review/current opens the review with 200', async () => {
    const res = await app.inject({ method: 'POST', url: '/shift-review/current' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'generating' });
    expect(service.start).toHaveBeenCalledWith(physicianId);
  });

  it('GET /shift-review/map reads only the map of the authenticated physician', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/shift-review/map?physicianId=99999999-9999-4999-8999-999999999999',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'insufficient', answered: 4, required: 20 });
    expect(maps.getMap).toHaveBeenCalledWith(physicianId);
  });

  describe('POST /shift-review/questions/:questionId/answer', () => {
    it('answers on behalf of the token physician, ignoring any physicianId in the body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/shift-review/questions/${questionId}/answer`,
        payload: {
          chosenOption: 1,
          confidence: 'unsure',
          physicianId: '99999999-9999-4999-8999-999999999999',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(service.answer).toHaveBeenCalledWith(physicianId, questionId, {
        chosenOption: 1,
        confidence: 'unsure',
      });
    });

    it('rejects a non-UUID question id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/shift-review/questions/abc/answer',
        payload: { chosenOption: 0, confidence: 'know' },
      });

      expect(res.statusCode).toBe(400);
      expect(service.answer).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown confidence', { chosenOption: 0, confidence: 'certeza' }],
      ['a negative option', { chosenOption: -1, confidence: 'know' }],
      ['a fractional option', { chosenOption: 0.5, confidence: 'know' }],
      ['a missing confidence', { chosenOption: 0 }],
    ])('rejects %s', async (_label, payload) => {
      const res = await app.inject({
        method: 'POST',
        url: `/shift-review/questions/${questionId}/answer`,
        payload,
      });

      expect(res.statusCode).toBe(400);
      expect(service.answer).not.toHaveBeenCalled();
    });
  });
});
