import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PrismaService } from '../../../config/prisma.service';
import { KnowledgeCardsController } from '../knowledge-cards.controller';
import { KnowledgeCardsService } from '../knowledge-cards.service';
import { KnowledgeCardDraftService } from '../drafting/card-draft.service';
import { CardReviewController } from './card-review.controller';
import { CardReviewService } from './card-review.service';

const reviewerId = '44444444-4444-4444-8444-444444444444';
const cardId = '55555555-5555-4555-8555-555555555555';
const skippedId = '66666666-6666-4666-8666-666666666666';

/** JwtAuthGuard simulado pelo header `x-test-user`; os guards de papel são os REAIS. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    request.user = JSON.parse(request.headers['x-test-user'] ?? '{}');
    return true;
  }
}

function asUser(role = 'PHYSICIAN') {
  return { 'x-test-user': JSON.stringify({ physicianId: reviewerId, role }) };
}

/** O médico revisor típico: papel PHYSICIAN, sem curadoria, CRM verificado. */
const REVIEWER = { isCardReviewer: true, crmVerified: true, isCurator: false };

describe('CardReviewController (HTTP)', () => {
  let app: NestFastifyApplication;
  const review = { next: vi.fn(), correct: vi.fn(), approve: vi.fn(), reject: vi.fn() };
  const cards = {
    list: vi.fn(),
    get: vi.fn(),
    createVersion: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    archive: vi.fn(),
  };
  const drafts = { draft: vi.fn(), listDrafts: vi.fn() };
  const prisma = { physician: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CardReviewController, KnowledgeCardsController],
      providers: [
        { provide: CardReviewService, useValue: review },
        { provide: KnowledgeCardsService, useValue: cards },
        { provide: KnowledgeCardDraftService, useValue: drafts },
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
    for (const mock of [
      ...Object.values(review),
      ...Object.values(cards),
      ...Object.values(drafts),
    ]) {
      mock.mockReset().mockResolvedValue({ ok: true });
    }
    prisma.physician.findUnique.mockReset().mockResolvedValue(REVIEWER);
  });

  describe('o papel de revisor dá acesso só à fila', () => {
    it('o médico revisor abre a fila', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/review/knowledge-cards/next',
        headers: asUser(),
      });

      expect(res.statusCode).toBe(200);
      expect(review.next).toHaveBeenCalledWith(reviewerId, { skip: [] });
    });

    it.each([
      ['GET', '/admin/knowledge-cards', undefined],
      ['GET', `/admin/knowledge-cards/${cardId}`, undefined],
      ['POST', '/admin/knowledge-cards/drafts', { topic: 'Meningite bacteriana' }],
      ['POST', `/admin/knowledge-cards/${cardId}/archive`, { reason: 'Fora do escopo' }],
      ['POST', `/admin/knowledge-cards/${cardId}/approve`, { version: 1 }],
    ] as const)('mas não o console admin: %s %s', async (method, url, payload) => {
      const res = await app.inject({ method, url, headers: asUser(), payload });

      expect(res.statusCode).toBe(403);
      for (const mock of [...Object.values(cards), ...Object.values(drafts)]) {
        expect(mock).not.toHaveBeenCalled();
      }
    });

    it('quem não é revisor não entra, mesmo admin curador', async () => {
      prisma.physician.findUnique.mockResolvedValue({
        isCardReviewer: false,
        crmVerified: true,
        isCurator: true,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/review/knowledge-cards/${cardId}/approve`,
        headers: asUser('ADMIN'),
        payload: { version: 1, reviewDurationMs: 1000 },
      });

      expect(res.statusCode).toBe(403);
      expect(review.approve).not.toHaveBeenCalled();
    });

    it('revisor sem CRM verificado não entra na fila', async () => {
      prisma.physician.findUnique.mockResolvedValue({ ...REVIEWER, crmVerified: false });

      const res = await app.inject({
        method: 'GET',
        url: '/review/knowledge-cards/next',
        headers: asUser(),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe('A revisão de cartões exige CRM verificado');
      expect(review.next).not.toHaveBeenCalled();
    });
  });

  it('lê os cartões pulados da query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/review/knowledge-cards/next?skip=${cardId},${skippedId}`,
      headers: asUser(),
    });

    expect(res.statusCode).toBe(200);
    expect(review.next).toHaveBeenCalledWith(reviewerId, { skip: [cardId, skippedId] });
  });

  it('recusa id pulado que não é uuid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/review/knowledge-cards/next?skip=abc',
      headers: asUser(),
    });

    expect(res.statusCode).toBe(400);
    expect(review.next).not.toHaveBeenCalled();
  });

  it('aprova com validade e o tempo de revisão medido', async () => {
    const payload = { version: 2, validityMonths: 24, reviewDurationMs: 180_000 };

    const res = await app.inject({
      method: 'POST',
      url: `/review/knowledge-cards/${cardId}/approve`,
      headers: asUser(),
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(review.approve).toHaveBeenCalledWith(reviewerId, cardId, payload);
  });

  it('na fila, decisão sem o tempo de revisão é recusada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/review/knowledge-cards/${cardId}/approve`,
      headers: asUser(),
      payload: { version: 2 },
    });

    expect(res.statusCode).toBe(400);
    expect(review.approve).not.toHaveBeenCalled();
  });

  it('descartar exige motivo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/review/knowledge-cards/${cardId}/reject`,
      headers: asUser(),
      payload: { version: 1, reason: '', reviewDurationMs: 1000 },
    });

    expect(res.statusCode).toBe(400);
    expect(review.reject).not.toHaveBeenCalled();
  });

  it('corrigir envia o conteúdo inteiro e a versão vista', async () => {
    const payload = { basedOnVersion: 1, content: { question: 'Qual a dose?' } };

    const res = await app.inject({
      method: 'POST',
      url: `/review/knowledge-cards/${cardId}/versions`,
      headers: asUser(),
      payload,
    });

    expect(res.statusCode).toBe(201);
    expect(review.correct).toHaveBeenCalledWith(reviewerId, cardId, payload);
  });
});
