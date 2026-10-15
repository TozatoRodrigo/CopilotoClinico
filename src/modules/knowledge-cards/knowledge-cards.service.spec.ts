import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../audit/audit-hash';
import type { KnowledgeCardContent } from '../../shared/contracts/knowledge-cards';
import {
  sourceChunk,
  sourceChunks,
  TREATMENT_CHUNK_ID,
  validCardInput,
} from '../../../tests/fixtures/knowledge-cards';
import { prepareCardContent } from './card-sources';
import { CARD_DETAIL_SELECT } from './knowledge-card-views';
import { KnowledgeCardsService } from './knowledge-cards.service';
import type { CardIndexService } from './card-index/card-index.service';
import type { KnowledgeGapsService } from '../knowledge-gaps/knowledge-gaps.service';

const CARD_ID = '88888888-8888-4888-8888-888888888888';
const VERSION_ID = '99999999-9999-4999-8999-999999999999';
const PUBLISHED_VERSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVIEWER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-10-14T12:00:00.000Z');

function preparedContent(): { content: KnowledgeCardContent; contentSha256: string } {
  const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });
  if (!prepared.ok) throw new Error('fixture inválida');
  return prepared;
}

const { content: CONTENT, contentSha256: CONTENT_SHA256 } = preparedContent();

interface StateOverrides {
  status?: 'draft' | 'in_review' | 'published' | 'archived';
  currentVersion?: number;
  publishedVersionId?: string | null;
}

function stateRow(overrides: StateOverrides = {}) {
  const currentVersion = overrides.currentVersion ?? 1;
  return {
    id: CARD_ID,
    status: overrides.status ?? 'in_review',
    institutionId: null,
    currentVersion,
    publishedVersionId: overrides.publishedVersionId ?? null,
    versions: [
      { id: VERSION_ID, version: currentVersion, contentSha256: CONTENT_SHA256, content: CONTENT },
    ],
  };
}

const reviewer = {
  id: REVIEWER_ID,
  name: 'Dra. Revisora',
  crmUf: 'SP',
  crmNumber: '123456',
  crmVerified: true,
};

function detailRow(validUntil: Date | null = null) {
  return {
    id: CARD_ID,
    institutionId: null,
    topic: 'Meningite bacteriana',
    syndrome: 'febre',
    status: validUntil ? 'published' : 'in_review',
    currentVersion: 1,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    publishedVersion: validUntil ? { version: 1, reviewedAt: NOW, validUntil, reviewer } : null,
    versions: [
      {
        id: VERSION_ID,
        version: 1,
        content: CONTENT,
        contentSha256: CONTENT_SHA256,
        authorKind: 'ai',
        reviewDecision: validUntil ? 'approved' : null,
        reviewedAt: validUntil ? NOW : null,
        reviewComment: null,
        reviewDurationMs: validUntil ? 42_000 : null,
        validUntil,
        createdAt: NOW,
        authorPhysician: null,
        reviewer: validUntil ? reviewer : null,
        draft: {
          id: DRAFT_ID,
          requestedModel: 'claude-opus-5-5',
          servedModel: 'claude-opus-5-5',
          promptSha256: 'p'.repeat(64),
          sourceContentSha256: 's'.repeat(64),
          createdAt: NOW,
        },
      },
    ],
  };
}

function createPrisma() {
  const chunks = sourceChunks();
  let state = stateRow();
  let detail = detailRow();
  const prisma = {
    knowledgeCard: {
      findUnique: vi.fn(
        async ({
          select,
        }: {
          select: unknown;
        }): Promise<ReturnType<typeof stateRow> | ReturnType<typeof detailRow> | null> =>
          select === CARD_DETAIL_SELECT ? detail : state,
      ),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeCardVersion: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    physician: { findUnique: vi.fn().mockResolvedValue({ crmVerified: true }) },
    guidelineChunk: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) => {
          const chunk = chunks.get(id);
          return chunk ? [chunk] : [];
        }),
      ),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => unknown) =>
    run(prisma),
  );
  return {
    prisma,
    chunks,
    setState: (overrides: StateOverrides) => {
      state = stateRow(overrides);
    },
    setDetail: (row: ReturnType<typeof detailRow>) => {
      detail = row;
    },
  };
}

describe('KnowledgeCardsService', () => {
  let db: ReturnType<typeof createPrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let cardIndex: { syncCard: ReturnType<typeof vi.fn> };
  let knowledgeGaps: { closeGroupsCoveredBy: ReturnType<typeof vi.fn> };
  let service: KnowledgeCardsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db = createPrisma();
    audit = { log: vi.fn().mockResolvedValue({}) };
    cardIndex = { syncCard: vi.fn().mockResolvedValue(null) };
    knowledgeGaps = { closeGroupsCoveredBy: vi.fn().mockResolvedValue(0) };
    service = new KnowledgeCardsService(
      db.prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      cardIndex as unknown as CardIndexService,
      knowledgeGaps as unknown as KnowledgeGapsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function auditCall() {
    return audit.log.mock.calls[0]?.[0] as { action: string; payload: Record<string, unknown> };
  }

  describe('approve (CC-402, critérios 1 e 2)', () => {
    it('recusa com 403 o revisor sem CRM verificado, sem gravar nada', async () => {
      db.prisma.physician.findUnique.mockResolvedValue({ crmVerified: false });

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.prisma.knowledgeCardVersion.updateMany).not.toHaveBeenCalled();
      expect(db.prisma.knowledgeCard.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('recusa revisor inexistente como sem CRM verificado', async () => {
      db.prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('grava revisor, data, validade e comentário mascarado na versão e a publica', async () => {
      await service.approve(REVIEWER_ID, CARD_ID, {
        version: 1,
        comment: 'Conferido com o PCDT; paciente CPF 529.982.247-25',
        reviewDurationMs: 42_000,
      });

      expect(db.prisma.knowledgeCardVersion.updateMany).toHaveBeenCalledWith({
        where: { id: VERSION_ID, reviewDecision: null },
        data: {
          reviewDecision: 'approved',
          reviewerId: REVIEWER_ID,
          reviewedAt: NOW,
          reviewComment: 'Conferido com o PCDT; paciente CPF [REDACTED_CPF]',
          reviewDurationMs: 42_000,
          validUntil: new Date('2027-10-14T12:00:00.000Z'),
        },
      });
      expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
        where: { id: CARD_ID, status: 'in_review', currentVersion: 1 },
        data: { status: 'published', publishedVersionId: VERSION_ID },
      });
    });

    it('registra CARD_APPROVED com versão e hash do conteúdo assinado, sem texto livre', async () => {
      await service.approve(REVIEWER_ID, CARD_ID, {
        version: 1,
        comment: 'Conferido',
        validityMonths: 6,
      });

      expect(audit.log).toHaveBeenCalledWith({
        actorId: REVIEWER_ID,
        action: 'CARD_APPROVED',
        entity: 'KnowledgeCard',
        entityId: CARD_ID,
        payload: {
          version: 1,
          contentSha256: CONTENT_SHA256,
          previousPublishedVersionId: null,
          validUntil: '2027-04-14T12:00:00.000Z',
          reviewDurationMs: null,
          commentSha256: sha256Hex('Conferido'),
        },
      });
    });

    it('recusa com 409 aprovar o que não está em revisão', async () => {
      db.setState({ status: 'draft' });

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toThrow(
        'não é possível aprovar um cartão rascunho',
      );
    });

    it('recusa com 409 aprovar uma versão que não é a mais recente', async () => {
      db.setState({ currentVersion: 2 });

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa com 409 quando outra decisão entrou no meio', async () => {
      db.prisma.knowledgeCardVersion.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('responde 404 para cartão inexistente', async () => {
      db.prisma.knowledgeCard.findUnique.mockResolvedValue(null);

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deixa a falha da trilha subir: a assinatura nunca fica sem registro em silêncio', async () => {
      audit.log.mockRejectedValue(new Error('db down'));

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toThrow(
        'db down',
      );
    });
  });

  describe('reject ("Descartar")', () => {
    it('arquiva o cartão que nunca foi publicado, com o motivo mascarado', async () => {
      await service.reject(REVIEWER_ID, CARD_ID, {
        version: 1,
        reason: 'Dose não confere com o PCDT',
        reviewDurationMs: 30_000,
      });

      expect(db.prisma.knowledgeCardVersion.updateMany).toHaveBeenCalledWith({
        where: { id: VERSION_ID, reviewDecision: null },
        data: {
          reviewDecision: 'rejected',
          reviewerId: REVIEWER_ID,
          reviewedAt: NOW,
          reviewComment: 'Dose não confere com o PCDT',
          reviewDurationMs: 30_000,
        },
      });
      expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
        where: { id: CARD_ID, status: 'in_review', currentVersion: 1 },
        data: { status: 'archived', archivedAt: NOW },
      });
      expect(auditCall()).toMatchObject({
        action: 'CARD_REJECTED',
        payload: {
          to: 'archived',
          reasonSha256: sha256Hex('Dose não confere com o PCDT'),
        },
      });
    });

    it('na correção de um cartão publicado, só a correção cai', async () => {
      db.setState({ currentVersion: 2, publishedVersionId: PUBLISHED_VERSION_ID });

      await service.reject(REVIEWER_ID, CARD_ID, { version: 2, reason: 'Correção errada' });

      expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
        where: { id: CARD_ID, status: 'in_review', currentVersion: 2 },
        data: { status: 'published', archivedAt: null },
      });
    });

    it('não exige CRM verificado para descartar', async () => {
      db.prisma.physician.findUnique.mockResolvedValue({ crmVerified: false });

      await service.reject(REVIEWER_ID, CARD_ID, { version: 1, reason: 'Fora do escopo' });

      expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalled();
    });
  });

  describe('createVersion ("Corrigir")', () => {
    it('grava a versão nova do médico e abre revisão de um cartão publicado', async () => {
      db.setState({ status: 'published', publishedVersionId: VERSION_ID });
      const content = validCardInput();
      content.answer = 'Ceftriaxona 2 g IV a cada 12 horas, sem aguardar o líquor.';

      await service.createVersion(REVIEWER_ID, CARD_ID, { basedOnVersion: 1, content });

      expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
        where: { id: CARD_ID, status: 'published', currentVersion: 1 },
        data: { status: 'in_review', currentVersion: 2 },
      });
      const created = db.prisma.knowledgeCardVersion.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown> & { content: KnowledgeCardContent };
      };
      expect(created.data).toMatchObject({
        cardId: CARD_ID,
        version: 2,
        authorKind: 'physician',
        authorPhysicianId: REVIEWER_ID,
      });
      expect(created.data.content.answer).toBe(content.answer);
      expect(created.data.contentSha256).not.toBe(CONTENT_SHA256);
      expect(auditCall()).toMatchObject({
        action: 'CARD_VERSION_CREATED',
        payload: { version: 2, basedOnVersion: 1, from: 'published', to: 'in_review' },
      });
    });

    it('devolve 422 com os problemas de citação, sem gravar', async () => {
      const content = validCardInput();
      content.answer = 'Ceftriaxona 4 g IV a cada 12 horas.';

      const error = await service
        .createVersion(REVIEWER_ID, CARD_ID, { basedOnVersion: 1, content })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        issues: [{ path: 'answer', message: 'dose sem fonte: "4 g" não está no trecho citado' }],
      });
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('mantém um trecho já citado mesmo depois de substituído', async () => {
      db.chunks.set(TREATMENT_CHUNK_ID, sourceChunk({ status: 'superseded' }));

      await service.createVersion(REVIEWER_ID, CARD_ID, {
        basedOnVersion: 1,
        content: validCardInput(),
      });

      expect(db.prisma.knowledgeCardVersion.create).toHaveBeenCalled();
    });

    it('recusa com 409 corrigir sobre uma versão desatualizada ou cartão arquivado', async () => {
      await expect(
        service.createVersion(REVIEWER_ID, CARD_ID, { basedOnVersion: 3, content: {} }),
      ).rejects.toBeInstanceOf(ConflictException);

      db.setState({ status: 'archived' });
      await expect(
        service.createVersion(REVIEWER_ID, CARD_ID, { basedOnVersion: 1, content: {} }),
      ).rejects.toThrow('não é possível corrigir um cartão arquivado');
    });
  });

  it('envia o rascunho para revisão (CARD_SUBMITTED)', async () => {
    db.setState({ status: 'draft' });

    await service.submit(REVIEWER_ID, CARD_ID, { version: 1 });

    expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
      where: { id: CARD_ID, status: 'draft', currentVersion: 1 },
      data: { status: 'in_review' },
    });
    expect(auditCall()).toMatchObject({
      action: 'CARD_SUBMITTED',
      payload: { version: 1, contentSha256: CONTENT_SHA256, from: 'draft', to: 'in_review' },
    });
  });

  it('arquiva o cartão publicado com o motivo mascarado', async () => {
    db.setState({ status: 'published', publishedVersionId: VERSION_ID });

    await service.archive(REVIEWER_ID, CARD_ID, { reason: 'PCDT revogado' });

    expect(db.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
      where: { id: CARD_ID, status: 'published', currentVersion: 1 },
      data: { archivedAt: NOW, archivedReason: 'PCDT revogado', status: 'archived' },
    });
    expect(auditCall()).toMatchObject({
      action: 'CARD_ARCHIVED',
      payload: { reasonSha256: sha256Hex('PCDT revogado') },
    });
  });

  describe('índice semântico (CC-406)', () => {
    it('reindexa o cartão depois de aprovar e de arquivar, já com a trilha gravada', async () => {
      await service.approve(REVIEWER_ID, CARD_ID, { version: 1 });
      expect(cardIndex.syncCard).toHaveBeenCalledWith(CARD_ID);
      expect(audit.log.mock.invocationCallOrder[0]).toBeLessThan(
        cardIndex.syncCard.mock.invocationCallOrder[0]!,
      );

      cardIndex.syncCard.mockClear();
      db.setState({ status: 'published', publishedVersionId: VERSION_ID });
      await service.archive(REVIEWER_ID, CARD_ID, { reason: 'PCDT revogado' });
      expect(cardIndex.syncCard).toHaveBeenCalledWith(CARD_ID);
    });

    it('não mexe no índice ao corrigir, enviar ou rejeitar: a versão publicada não muda', async () => {
      db.setState({ status: 'published', publishedVersionId: VERSION_ID });
      await service.createVersion(REVIEWER_ID, CARD_ID, {
        basedOnVersion: 1,
        content: validCardInput(),
      });
      db.setState({ status: 'draft' });
      await service.submit(REVIEWER_ID, CARD_ID, { version: 1 });
      db.setState({ currentVersion: 2, publishedVersionId: PUBLISHED_VERSION_ID });
      await service.reject(REVIEWER_ID, CARD_ID, { version: 2, reason: 'Correção errada' });

      expect(cardIndex.syncCard).not.toHaveBeenCalled();
    });

    it('não reindexa quando a transição é recusada', async () => {
      db.prisma.physician.findUnique.mockResolvedValue({ crmVerified: false });

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(cardIndex.syncCard).not.toHaveBeenCalled();
    });
  });

  describe('lacunas (CC-409)', () => {
    it('aprovar fecha as lacunas cobertas, depois de publicar e reindexar', async () => {
      await service.approve(REVIEWER_ID, CARD_ID, { version: 1 });

      expect(knowledgeGaps.closeGroupsCoveredBy).toHaveBeenCalledWith(CARD_ID, REVIEWER_ID);
      expect(cardIndex.syncCard.mock.invocationCallOrder[0]).toBeLessThan(
        knowledgeGaps.closeGroupsCoveredBy.mock.invocationCallOrder[0]!,
      );
    });

    it('falhar ao fechar lacunas não desfaz a aprovação', async () => {
      knowledgeGaps.closeGroupsCoveredBy.mockRejectedValue(new Error('banco fora'));

      await expect(service.approve(REVIEWER_ID, CARD_ID, { version: 1 })).resolves.toBeDefined();
    });

    it('corrigir, enviar, rejeitar e arquivar não fecham lacuna', async () => {
      db.setState({ status: 'draft' });
      await service.submit(REVIEWER_ID, CARD_ID, { version: 1 });
      db.setState({ status: 'published', publishedVersionId: VERSION_ID });
      await service.archive(REVIEWER_ID, CARD_ID, { reason: 'PCDT revogado' });

      expect(knowledgeGaps.closeGroupsCoveredBy).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('mostra "revisar" quando a aprovação venceu (CC-402, critério 3)', async () => {
      db.setDetail(detailRow(new Date('2026-10-13T12:00:00.000Z')));

      const detail = await service.get(CARD_ID);

      expect(detail).toMatchObject({
        status: 'published',
        displayStatus: 'needs_review',
        question: CONTENT.question,
        published: {
          version: 1,
          reviewer: { name: 'Dra. Revisora', crmVerified: true },
          validUntil: '2026-10-13T12:00:00.000Z',
        },
      });
      expect(detail.versions[0]).toMatchObject({
        contentSha256: CONTENT_SHA256,
        draft: { draftId: DRAFT_ID },
        review: { decision: 'approved', durationMs: 42_000 },
      });
    });

    it('mantém publicado dentro da validade', async () => {
      db.setDetail(detailRow(new Date('2027-10-14T12:00:00.000Z')));

      expect((await service.get(CARD_ID)).displayStatus).toBe('published');
    });

    it('responde 404 para cartão inexistente', async () => {
      db.prisma.knowledgeCard.findUnique.mockResolvedValue(null);

      await expect(service.get(CARD_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('falha alto quando o conteúdo gravado não valida', async () => {
      const row = detailRow();
      row.versions[0]!.content = { question: 'x' } as unknown as KnowledgeCardContent;
      db.setDetail(row);

      await expect(service.get(CARD_ID)).rejects.toThrow('KNOWLEDGE_CARD_CONTENT_INVALID');
    });
  });

  describe('list', () => {
    it('filtra "revisar" pela validade da versão publicada e conta por status de tela', async () => {
      db.prisma.knowledgeCard.groupBy.mockResolvedValue([
        { status: 'in_review', _count: { _all: 4 } },
        { status: 'published', _count: { _all: 10 } },
      ]);
      db.prisma.knowledgeCard.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);

      const page = await service.list({
        displayStatus: 'needs_review',
        syndrome: 'febre',
        limit: 20,
        offset: 0,
      });

      expect(db.prisma.knowledgeCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { syndrome: 'febre' },
              { status: 'published', publishedVersion: { validUntil: { lt: NOW } } },
            ],
          },
          take: 20,
          skip: 0,
        }),
      );
      expect(page.total).toBe(3);
      expect(page.countsByDisplayStatus).toEqual({
        draft: 0,
        in_review: 4,
        published: 7,
        archived: 0,
        needs_review: 3,
      });
    });
  });
});
