import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import { KnowledgeGapQueueController } from './knowledge-gap-queue.controller';
import { KnowledgeGapQueueService } from './knowledge-gap-queue.service';

const curatorId = '44444444-4444-4444-8444-444444444444';
const groupId = '55555555-5555-4555-8555-555555555555';

/** Usuário do header `x-test-user`; os guards de papel e de curadoria são os reais. */
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

describe('KnowledgeGapQueueController (HTTP, CC-409)', () => {
  let app: NestFastifyApplication;
  const queue = {
    list: vi.fn(),
    weeklyReport: vi.fn(),
    draft: vi.fn(),
    dismiss: vi.fn(),
    reopen: vi.fn(),
  };
  const prisma = { physician: { findUnique: vi.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KnowledgeGapQueueController],
      providers: [
        { provide: KnowledgeGapQueueService, useValue: queue },
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
    for (const fn of Object.values(queue)) fn.mockReset().mockResolvedValue({});
    prisma.physician.findUnique.mockReset().mockResolvedValue({ isCurator: true });
  });

  it('recusa médico sem papel de admin e admin que não é curador', async () => {
    const physician = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-gaps',
      headers: asUser('PHYSICIAN'),
    });
    prisma.physician.findUnique.mockResolvedValue({ isCurator: false });
    const notCurator = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-gaps',
      headers: asUser('ADMIN'),
    });

    expect(physician.statusCode).toBe(403);
    expect(notCurator.statusCode).toBe(403);
    expect(queue.list).not.toHaveBeenCalled();
  });

  it('lista com filtro e paginação padrão', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-gaps?status=open',
      headers: asUser('COMPLIANCE'),
    });

    expect(res.statusCode).toBe(200);
    expect(queue.list).toHaveBeenCalledWith({ status: 'open', limit: 20, offset: 0 });
  });

  it('recusa status fora da lista', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-gaps?status=closed',
      headers: asUser('ADMIN'),
    });

    expect(res.statusCode).toBe(400);
  });

  it('o relatório semanal não é confundido com um id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/knowledge-gaps/weekly-report?endingAt=2026-10-16T12:00:00.000Z',
      headers: asUser('ADMIN'),
    });

    expect(res.statusCode).toBe(200);
    expect(queue.weeklyReport).toHaveBeenCalledWith(new Date('2026-10-16T12:00:00.000Z'));
  });

  it('gera rascunho com o curador como quem pediu', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-gaps/${groupId}/draft`,
      headers: asUser('ADMIN'),
      payload: { topic: 'Anafilaxia: adrenalina IM' },
    });

    expect(res.statusCode).toBe(200);
    expect(queue.draft).toHaveBeenCalledWith(curatorId, groupId, {
      topic: 'Anafilaxia: adrenalina IM',
      submitForReview: true,
    });
  });

  it('descartar exige motivo; campo desconhecido é recusado', async () => {
    const noReason = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-gaps/${groupId}/dismiss`,
      headers: asUser('ADMIN'),
      payload: {},
    });
    const extra = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-gaps/${groupId}/dismiss`,
      headers: asUser('ADMIN'),
      payload: { reason: 'Administrativo', physicianId: curatorId },
    });
    const ok = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-gaps/${groupId}/dismiss`,
      headers: asUser('ADMIN'),
      payload: { reason: 'Administrativo' },
    });

    expect(noReason.statusCode).toBe(400);
    expect(extra.statusCode).toBe(400);
    expect(ok.statusCode).toBe(200);
    expect(queue.dismiss).toHaveBeenCalledWith(curatorId, groupId, { reason: 'Administrativo' });
  });

  it('reabre pelo id e recusa id que não é UUID', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: `/admin/knowledge-gaps/${groupId}/reopen`,
      headers: asUser('ADMIN'),
    });
    const bad = await app.inject({
      method: 'POST',
      url: '/admin/knowledge-gaps/nao-e-uuid/reopen',
      headers: asUser('ADMIN'),
    });

    expect(ok.statusCode).toBe(200);
    expect(queue.reopen).toHaveBeenCalledWith(curatorId, groupId);
    expect(bad.statusCode).toBe(400);
  });
});
