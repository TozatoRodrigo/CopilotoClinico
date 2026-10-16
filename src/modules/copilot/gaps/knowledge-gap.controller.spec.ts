import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { KNOWLEDGE_GAP_NOTE_MAX_CHARS } from '../../../shared/contracts/clinical';
import { KnowledgeGapController } from './knowledge-gap.controller';
import { KnowledgeGapService } from './knowledge-gap.service';

const physicianId = '11111111-1111-4111-8111-111111111111';
const encounterId = '22222222-2222-4222-8222-222222222222';
const interactionId = '33333333-3333-4333-8333-333333333333';
const url = `/encounters/${encounterId}/copilot/knowledge-gaps`;

/** Simula o JwtAuthGuard: sem `x-test-user`, recusa como o guard real. */
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

const asPhysician = { 'x-test-user': JSON.stringify({ physicianId, role: 'PHYSICIAN' }) };

describe('KnowledgeGapController (HTTP)', () => {
  let app: NestFastifyApplication;
  const service = { reportNotFound: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KnowledgeGapController],
      providers: [{ provide: KnowledgeGapService, useValue: service }],
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
    service.reportNotFound.mockReset().mockResolvedValue({ recorded: true });
  });

  it('registers the gap on behalf of the authenticated physician', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: asPhysician,
      payload: { interactionId, note: 'Faltou a dose por peso' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ recorded: true });
    expect(service.reportNotFound).toHaveBeenCalledWith(physicianId, encounterId, {
      interactionId,
      note: 'Faltou a dose por peso',
    });
  });

  it('accepts the report without a note', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: asPhysician,
      payload: { interactionId },
    });

    expect(res.statusCode).toBe(201);
    expect(service.reportNotFound).toHaveBeenCalledWith(physicianId, encounterId, {
      interactionId,
    });
  });

  it('refuses an unauthenticated request', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { interactionId } });

    expect(res.statusCode).toBe(403);
    expect(service.reportNotFound).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-UUID interaction', { interactionId: '42' }],
    [
      'a note above the limit',
      { interactionId, note: 'x'.repeat(KNOWLEDGE_GAP_NOTE_MAX_CHARS + 1) },
    ],
  ])('rejects %s', async (_label, payload) => {
    const res = await app.inject({ method: 'POST', url, headers: asPhysician, payload });

    expect(res.statusCode).toBe(400);
    expect(service.reportNotFound).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID encounter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/encounters/42/copilot/knowledge-gaps',
      headers: asPhysician,
      payload: { interactionId },
    });

    expect(res.statusCode).toBe(400);
    expect(service.reportNotFound).not.toHaveBeenCalled();
  });
});
