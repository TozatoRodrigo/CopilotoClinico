import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../../../config/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { sha256Hex } from '../../audit/audit-hash';
import { sourceChunks, validCardInput } from '../../../../tests/fixtures/knowledge-cards';
import { prepareCardContent } from '../card-sources';
import type { KnowledgeCardsService } from '../knowledge-cards.service';
import { CrossReviewService } from './cross-review.service';

const CARD_ID = '88888888-8888-4888-8888-888888888888';
const SAMPLED_VERSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CORRECTION_VERSION_ID = '12121212-1212-4212-8212-121212121212';
const CROSS_REVIEW_ID = 'abababab-abab-4bab-8bab-abababababab';
const FIRST_REVIEWER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const AUTHOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECOND_REVIEWER_ID = '44444444-4444-4444-8444-444444444444';

function storedContent() {
  const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });
  if (!prepared.ok) throw new Error('fixture inválida');
  return prepared;
}

const { content: CONTENT, contentSha256: CONTENT_SHA256 } = storedContent();

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: CROSS_REVIEW_ID,
    cardId: CARD_ID,
    status: 'pending',
    versionId: SAMPLED_VERSION_ID,
    firstReviewerId: FIRST_REVIEWER_ID,
    versionAuthorId: AUTHOR_ID,
    version: { version: 2, contentSha256: CONTENT_SHA256 },
    ...overrides,
  };
}

function publishedCard(overrides: Record<string, unknown> = {}) {
  return {
    status: 'published',
    institutionId: null,
    currentVersion: 2,
    publishedVersionId: SAMPLED_VERSION_ID,
    publishedVersion: { content: CONTENT },
    ...overrides,
  };
}

function ref(id: string, name: string) {
  return { id, name, crmUf: 'SP', crmNumber: '123456', crmVerified: true };
}

function createDeps() {
  const chunks = sourceChunks();
  const prisma = {
    physicianInstitution: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeCardCrossReview: {
      findFirst: vi.fn().mockResolvedValue(task()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    knowledgeCard: {
      findUnique: vi.fn().mockResolvedValue(publishedCard()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeCardVersion: {
      create: vi.fn().mockResolvedValue({ id: CORRECTION_VERSION_ID }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
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
  const audit = { log: vi.fn().mockResolvedValue({}) };
  const cards = { get: vi.fn().mockResolvedValue({ id: CARD_ID }) };
  const service = new CrossReviewService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    cards as unknown as KnowledgeCardsService,
  );
  return { prisma, audit, cards, service };
}

describe('CrossReviewService (CC-411)', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  describe('segundo médico', () => {
    it.each([
      ['quem aprovou', FIRST_REVIEWER_ID, /você aprovou/],
      ['quem escreveu a versão', AUTHOR_ID, /você escreveu/],
    ])('recusa %s com 403, sem gravar', async (_label, reviewerId, message) => {
      await expect(
        deps.service.agree(reviewerId, CROSS_REVIEW_ID, { reviewDurationMs: 1000 }),
      ).rejects.toThrow(message);
      await expect(
        deps.service.agree(reviewerId, CROSS_REVIEW_ID, { reviewDurationMs: 1000 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(deps.prisma.knowledgeCardCrossReview.updateMany).not.toHaveBeenCalled();
    });

    it('fora do escopo do médico: 404', async () => {
      deps.prisma.knowledgeCardCrossReview.findFirst.mockResolvedValue(null);

      await expect(
        deps.service.agree(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, { reviewDurationMs: 1000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deps.prisma.knowledgeCardCrossReview.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CROSS_REVIEW_ID, card: { institutionId: null } } }),
      );
    });

    it('já feita: 409', async () => {
      deps.prisma.knowledgeCardCrossReview.findFirst.mockResolvedValue(task({ status: 'agreed' }));

      await expect(
        deps.service.agree(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, { reviewDurationMs: 1000 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('concordar', () => {
    it('grava a concordância só se a versão sorteada ainda está no ar, e audita sem texto', async () => {
      await deps.service.agree(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, {
        reviewDurationMs: 61_000,
        comment: 'Conferi a dose na tabela',
      });

      expect(deps.prisma.knowledgeCardCrossReview.updateMany).toHaveBeenCalledWith({
        where: {
          id: CROSS_REVIEW_ID,
          status: 'pending',
          version: { publishedOf: { is: { status: 'published' } } },
        },
        data: {
          status: 'agreed',
          reviewerId: SECOND_REVIEWER_ID,
          reviewedAt: expect.any(Date),
          comment: 'Conferi a dose na tabela',
          reviewDurationMs: 61_000,
        },
      });
      expect(deps.audit.log).toHaveBeenCalledWith({
        actorId: SECOND_REVIEWER_ID,
        action: 'CARD_CROSS_REVIEW_AGREED',
        entity: 'KnowledgeCard',
        entityId: CARD_ID,
        payload: {
          crossReviewId: CROSS_REVIEW_ID,
          version: 2,
          contentSha256: CONTENT_SHA256,
          reviewDurationMs: 61_000,
          commentSha256: sha256Hex('Conferi a dose na tabela'),
        },
      });
    });

    it('a versão saiu do ar no meio (outra aprovação, arquivamento): 409', async () => {
      deps.prisma.knowledgeCardCrossReview.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        deps.service.agree(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, { reviewDurationMs: 1000 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(deps.audit.log).not.toHaveBeenCalled();
    });
  });

  describe('divergir é corrigir', () => {
    const reason = 'A dose máxima de 4 g é por dia, conferir';
    function input(content: unknown = validCardInput()) {
      return { reason, reviewDurationMs: 240_000, basedOnVersion: 2, content };
    }

    it('grava a correção como versão nova, tira o cartão do ar e o devolve à fila', async () => {
      await deps.service.diverge(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, input());

      expect(deps.prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
        where: {
          id: CARD_ID,
          status: 'published',
          publishedVersionId: SAMPLED_VERSION_ID,
          currentVersion: 2,
        },
        data: { status: 'in_review', currentVersion: 3, publishedVersionId: null },
      });
      expect(deps.prisma.knowledgeCardVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cardId: CARD_ID,
          version: 3,
          contentSha256: CONTENT_SHA256,
          authorKind: 'physician',
          authorPhysicianId: SECOND_REVIEWER_ID,
        }),
        select: { id: true },
      });
      expect(deps.prisma.knowledgeCardCrossReview.updateMany).toHaveBeenCalledWith({
        where: { id: CROSS_REVIEW_ID, status: 'pending' },
        data: {
          status: 'diverged',
          reviewerId: SECOND_REVIEWER_ID,
          reviewedAt: expect.any(Date),
          comment: reason,
          reviewDurationMs: 240_000,
          correctionVersionId: CORRECTION_VERSION_ID,
        },
      });
    });

    it('registra a divergência na trilha com versões e hashes, sem o motivo em texto', async () => {
      await deps.service.diverge(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, input());

      expect(deps.audit.log).toHaveBeenCalledWith({
        actorId: SECOND_REVIEWER_ID,
        action: 'CARD_CROSS_REVIEW_DIVERGED',
        entity: 'KnowledgeCard',
        entityId: CARD_ID,
        payload: {
          crossReviewId: CROSS_REVIEW_ID,
          version: 2,
          withdrawnVersionId: SAMPLED_VERSION_ID,
          correctionVersion: 3,
          contentSha256: CONTENT_SHA256,
          from: 'published',
          to: 'in_review',
          reviewDurationMs: 240_000,
          reasonSha256: sha256Hex(reason),
        },
      });
      expect(JSON.stringify(deps.audit.log.mock.calls)).not.toContain('dose máxima');
    });

    it('correção com dose fora do trecho citado: 422, nada gravado', async () => {
      const wrongDose = validCardInput();
      wrongDose.claims[0]!.dose!.amount = '4 mg';

      const failure = deps.service.diverge(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, input(wrongDose));

      await expect(failure).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(deps.prisma.$transaction).not.toHaveBeenCalled();
      expect(deps.prisma.knowledgeCardCrossReview.updateMany).not.toHaveBeenCalled();
    });

    it('com correção em andamento ou a versão já fora do ar: 409', async () => {
      deps.prisma.knowledgeCard.findUnique.mockResolvedValue(
        publishedCard({ status: 'in_review' }),
      );
      await expect(
        deps.service.diverge(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, input()),
      ).rejects.toBeInstanceOf(ConflictException);

      deps.prisma.knowledgeCard.findUnique.mockResolvedValue(
        publishedCard({ publishedVersionId: CORRECTION_VERSION_ID }),
      );
      await expect(
        deps.service.diverge(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, input()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('divergir de outra versão que não a publicada: 409', async () => {
      await expect(
        deps.service.diverge(SECOND_REVIEWER_ID, CROSS_REVIEW_ID, {
          ...input(),
          basedOnVersion: 1,
        }),
      ).rejects.toThrow('A versão publicada é a 2; recarregue antes de divergir');
    });
  });

  describe('painel', () => {
    it('calcula concordância, divergência, pendentes e o tempo mediano de revisão', async () => {
      deps.prisma.knowledgeCardCrossReview.groupBy.mockResolvedValue([
        { status: 'pending', _count: { _all: 3 } },
        { status: 'agreed', _count: { _all: 19 } },
        { status: 'diverged', _count: { _all: 1 } },
      ]);
      deps.prisma.knowledgeCardCrossReview.count.mockResolvedValue(2);
      deps.prisma.knowledgeCardVersion.count.mockResolvedValue(230);
      deps.prisma.knowledgeCardVersion.findMany.mockResolvedValue([
        { reviewDurationMs: 180_000 },
        { reviewDurationMs: 300_000 },
        { reviewDurationMs: 420_000 },
      ]);
      deps.prisma.knowledgeCardCrossReview.findMany.mockResolvedValue([
        {
          id: CROSS_REVIEW_ID,
          comment: 'A dose máxima é por dia',
          reviewedAt: new Date('2026-10-14T10:00:00.000Z'),
          card: { id: CARD_ID, topic: 'Meningite bacteriana', status: 'in_review' },
          version: { version: 2, content: CONTENT },
          correctionVersion: { version: 3 },
          firstReviewer: ref(FIRST_REVIEWER_ID, 'Dr. Primeiro'),
          reviewer: ref(SECOND_REVIEWER_ID, 'Dra. Segunda'),
        },
      ]);

      const summary = await deps.service.summary(SECOND_REVIEWER_ID);

      expect(summary).toMatchObject({
        samplePercent: 10,
        approvals: 230,
        sampled: 23,
        pending: 2,
        superseded: 1,
        agreed: 19,
        diverged: 1,
        agreementRate: 0.95,
        divergenceRate: 0.05,
        divergenceTarget: 0.05,
        reviewTime: { decisions: 3, medianMs: 300_000 },
      });
      expect(summary.recentDivergences).toEqual([
        {
          crossReviewId: CROSS_REVIEW_ID,
          cardId: CARD_ID,
          topic: 'Meningite bacteriana',
          question: CONTENT.question,
          cardStatus: 'in_review',
          disputedVersion: 2,
          correctionVersion: 3,
          firstReviewer: ref(FIRST_REVIEWER_ID, 'Dr. Primeiro'),
          crossReviewer: ref(SECOND_REVIEWER_ID, 'Dra. Segunda'),
          reason: 'A dose máxima é por dia',
          reviewedAt: '2026-10-14T10:00:00.000Z',
        },
      ]);
    });

    it('sem revisão cruzada feita, sem taxa', async () => {
      const summary = await deps.service.summary(SECOND_REVIEWER_ID);

      expect(summary).toMatchObject({
        sampled: 0,
        agreementRate: null,
        divergenceRate: null,
        reviewTime: { decisions: 0, medianMs: null },
        recentDivergences: [],
      });
    });
  });
});
