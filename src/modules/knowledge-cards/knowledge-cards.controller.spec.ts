import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ForbiddenException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import { KnowledgeCardsController } from './knowledge-cards.controller';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';

const curatorId = '44444444-4444-4444-8444-444444444444';
const cardId = '55555555-5555-4555-8555-555555555555';
const chunkId = '66666666-6666-4666-8666-666666666666';

/** JwtAuthGuard simulado pelo header `x-test-user`; papel e curadoria são os guards REAIS. */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    request.user = JSON.parse(request.headers['x-test-user'] ?? '{}');
    return true;
  }
}

function asUser(role: string) {
  return { 'x-test-user': JSON.stringify({ physicianId: curatorId, role }) };
}

describe('KnowledgeCardsController (HTTP)', () => {
  let app: NestFastifyApplication;
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
      controllers: [KnowledgeCardsController],
      providers: [
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
    for (const mock of [...Object.values(cards), ...Object.values(drafts)]) {
      mock.mockReset().mockResolvedValue({ ok: true });
    }
    prisma.physician.findUnique.mockReset().mockResolvedValue({ isCurator: true });
  });

  describe('barreira de acesso', () => {
    it('recusa médico sem papel de admin, mesmo curador', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/knowledge-cards',
        headers: asUser('PHYSICIAN'),
      });

      expect(res.statusCode).toBe(403);
      expect(cards.list).not.toHaveBeenCalled();
    });

    it('recusa admin que não é curador clínico', async () => {
      prisma.physician.findUnique.mockResolvedValue({ isCurator: false });

      const res = await app.inject({
        method: 'POST',
        url: `/admin/knowledge-cards/${cardId}/approve`,
        headers: asUser('ADMIN'),
        payload: { version: 1 },
      });

      expect(res.statusCode).toBe(403);
      expect(cards.approve).not.toHaveBeenCalled();
    });
  });

  it('lista com paginação padrão e filtro de status de tela', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-cards?displayStatus=needs_review',
      headers: asUser('COMPLIANCE'),
    });

    expect(res.statusCode).toBe(200);
    expect(cards.list).toHaveBeenCalledWith({
      displayStatus: 'needs_review',
      limit: 20,
      offset: 0,
    });
  });

  it('não confunde "drafts" com id de cartão', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-cards/drafts?limit=5',
      headers: asUser('ADMIN'),
    });

    expect(res.statusCode).toBe(200);
    expect(drafts.listDrafts).toHaveBeenCalledWith({ limit: 5, offset: 0 });
    expect(cards.get).not.toHaveBeenCalled();
  });

  it('pede rascunho em nome do curador autenticado, em revisão por padrão', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/knowledge-cards/drafts',
      headers: asUser('ADMIN'),
      payload: { topic: 'Meningite bacteriana', syndrome: 'febre', chunkIds: [chunkId] },
    });

    expect(res.statusCode).toBe(201);
    expect(drafts.draft).toHaveBeenCalledWith({
      topic: 'Meningite bacteriana',
      syndrome: 'febre',
      institutionId: null,
      chunkIds: [chunkId],
      requestedBy: curatorId,
      submitForReview: true,
    });
  });

  it('recusa síndrome fora da lista de PS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/knowledge-cards/drafts',
      headers: asUser('ADMIN'),
      payload: { topic: 'Meningite bacteriana', syndrome: 'meningite' },
    });

    expect(res.statusCode).toBe(400);
    expect(drafts.draft).not.toHaveBeenCalled();
  });

  it('aprova em nome do revisor autenticado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-cards/${cardId}/approve`,
      headers: asUser('ADMIN'),
      payload: { version: 2, comment: 'Conferido', validityMonths: 6, reviewDurationMs: 40_000 },
    });

    expect(res.statusCode).toBe(200);
    expect(cards.approve).toHaveBeenCalledWith(curatorId, cardId, {
      version: 2,
      comment: 'Conferido',
      validityMonths: 6,
      reviewDurationMs: 40_000,
    });
  });

  it('propaga o 403 do revisor sem CRM verificado', async () => {
    cards.approve.mockRejectedValue(
      new ForbiddenException('Aprovar um cartão exige CRM verificado'),
    );

    const res = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-cards/${cardId}/approve`,
      headers: asUser('ADMIN'),
      payload: { version: 1 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ message: string }>().message).toBe('Aprovar um cartão exige CRM verificado');
  });

  it('exige a versão vista em toda decisão e o motivo ao descartar', async () => {
    const withoutVersion = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-cards/${cardId}/approve`,
      headers: asUser('ADMIN'),
      payload: {},
    });
    const withoutReason = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-cards/${cardId}/reject`,
      headers: asUser('ADMIN'),
      payload: { version: 1 },
    });

    expect(withoutVersion.statusCode).toBe(400);
    expect(withoutReason.statusCode).toBe(400);
    expect(cards.approve).not.toHaveBeenCalled();
    expect(cards.reject).not.toHaveBeenCalled();
  });

  it.each([
    ['submit', { version: 1 }],
    ['reject', { version: 1, reason: 'Fora do escopo' }],
    ['archive', { reason: 'PCDT revogado' }],
  ] as const)('%s chama o serviço com o curador e o corpo validado', async (action, payload) => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-cards/${cardId}/${action}`,
      headers: asUser('ADMIN'),
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(cards[action]).toHaveBeenCalledWith(curatorId, cardId, payload);
  });

  it('cria versão com o conteúdo cru para o serviço validar e citar', async () => {
    const content = { question: 'Qual a dose?' };
    const res = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-cards/${cardId}/versions`,
      headers: asUser('ADMIN'),
      payload: { basedOnVersion: 1, content },
    });

    expect(res.statusCode).toBe(201);
    expect(cards.createVersion).toHaveBeenCalledWith(curatorId, cardId, {
      basedOnVersion: 1,
      content,
    });
  });

  it('recusa id de cartão que não é UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-cards/42',
      headers: asUser('ADMIN'),
    });

    expect(res.statusCode).toBe(400);
    expect(cards.get).not.toHaveBeenCalled();
  });
});
