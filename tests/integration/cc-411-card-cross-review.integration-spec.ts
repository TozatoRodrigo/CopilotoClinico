/**
 * Testes de integração — CC-404 (fila de revisão no celular) e CC-411
 * (revisão cruzada de 10% dos cartões aprovados), ADR-019 adendo.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (até 20261015120100_cc_411_card_cross_reviews).
 *
 * Cobre o que os testes unitários não alcançam: o sorteio na transação da
 * aprovação (e o mesmo balde calculado em SQL, como no runbook), os filtros
 * de relação do Prisma na fila (versão ainda publicada), a divergência que
 * tira o cartão do ar numa transação, o CHECK de segundo médico e o trigger
 * que congela o sorteio e a decisão. Nenhuma chamada de IA.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/config/prisma.service';
import { KnowledgeCardsService } from '../../src/modules/knowledge-cards/knowledge-cards.service';
import { CardIndexService } from '../../src/modules/knowledge-cards/card-index/card-index.service';
import { CardReviewService } from '../../src/modules/knowledge-cards/review/card-review.service';
import { CrossReviewService } from '../../src/modules/knowledge-cards/review/cross-review.service';
import {
  loadSourceChunks,
  prepareCardContent,
} from '../../src/modules/knowledge-cards/card-sources';
import { toJsonValue } from '../../src/modules/audit/audit-hash';
import { DIAGNOSIS_TEXT, TREATMENT_TEXT, validCardInput } from '../fixtures/knowledge-cards';

const EMAIL_DOMAIN = '@cc411.test';
const SOURCE = 'CC-411 teste de integração';
const TOPIC = 'CC-411 meningite bacteriana';
/** Balde 1 do hash de "cc-411:<id>": cai nos 10% sorteados. */
const SAMPLED_VERSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** Balde 71: fica de fora. */
const UNSAMPLED_VERSION_ID = '99999999-9999-4999-8999-999999999999';

describe('CC-404/CC-411 — fila de revisão e revisão cruzada (integration)', () => {
  let prisma: PrismaClient;
  let cards: KnowledgeCardsService;
  let review: CardReviewService;
  let crossReview: CrossReviewService;
  let firstReviewerId: string;
  let authorId: string;
  let secondReviewerId: string;
  let thirdReviewerId: string;
  let chunkIds: string[];

  async function cleanUp(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_card_cross_reviews
        WHERE card_id IN (SELECT id FROM knowledge_cards WHERE topic LIKE 'CC-411 %')`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_cards SET status = 'archived', archived_at = now(), published_version_id = NULL
        WHERE topic LIKE 'CC-411 %'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_card_versions
        WHERE card_id IN (SELECT id FROM knowledge_cards WHERE topic LIKE 'CC-411 %')`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM knowledge_cards WHERE topic LIKE 'CC-411 %'`);
    await prisma.guidelineChunk.deleteMany({ where: { source: SOURCE } });
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await cleanUp();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await cleanUp();
    const physician = async (n: string) =>
      (
        await prisma.physician.create({
          data: {
            email: `medico-${n}-${Date.now()}${EMAIL_DOMAIN}`,
            passwordHash: 'x',
            crmUf: 'SP',
            crmNumber: `0011${n}`,
            crmVerified: true,
            isCardReviewer: true,
          },
        })
      ).id;
    firstReviewerId = await physician('01');
    authorId = await physician('02');
    secondReviewerId = await physician('03');
    thirdReviewerId = await physician('04');

    chunkIds = [];
    for (const [text, section] of [
      [TREATMENT_TEXT, '7. TRATAMENTO'],
      [DIAGNOSIS_TEXT, '6. DIAGNÓSTICO'],
    ] as const) {
      const chunk = await prisma.guidelineChunk.create({
        data: {
          source: SOURCE,
          sourceVersion: '2024-05',
          specialty: 'infectologia',
          text,
          status: 'official_unreviewed',
          metadata: { section },
        },
      });
      chunkIds.push(chunk.id);
    }

    const audit = new AuditService(prisma as unknown as PrismaService);
    // CC-406 — índice de verdade, com o embedding desligado: aprovar grava a
    // linha sem vetor, e nenhuma chamada de IA sai daqui.
    const cardIndex = new CardIndexService(prisma as unknown as PrismaService, {
      enabled: () => false,
      identity: () => ({ provider: 'none', model: 'none' }),
      embed: () => Promise.reject(new Error('embedding desligado')),
    });
    cards = new KnowledgeCardsService(prisma as unknown as PrismaService, audit, cardIndex);
    review = new CardReviewService(prisma as unknown as PrismaService, cards);
    crossReview = new CrossReviewService(prisma as unknown as PrismaService, audit, cards);
  });

  function cardInput() {
    const input = validCardInput();
    input.sources = [
      { key: 'S1', chunkId: chunkIds[0] as string },
      { key: 'S2', chunkId: chunkIds[1] as string },
    ];
    return input;
  }

  /**
   * Cartão em revisão com a versão 1 escrita por um médico e com o id
   * escolhido — o sorteio depende do id da versão.
   */
  async function cardInReview(
    versionId: string,
    data: Partial<Prisma.KnowledgeCardUncheckedCreateInput> = {},
  ): Promise<string> {
    const prepared = prepareCardContent(
      cardInput(),
      await loadSourceChunks(prisma as unknown as PrismaService, chunkIds),
      { institutionId: data.institutionId ?? null },
    );
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
    const card = await prisma.knowledgeCard.create({
      data: { topic: TOPIC, status: 'in_review', currentVersion: 1, ...data },
    });
    await prisma.knowledgeCardVersion.create({
      data: {
        id: versionId,
        cardId: card.id,
        version: 1,
        content: toJsonValue({ ...prepared.content }) as Prisma.InputJsonValue,
        contentSha256: prepared.contentSha256,
        authorKind: 'physician',
        authorPhysicianId: authorId,
      },
    });
    return card.id;
  }

  describe('sorteio na aprovação', () => {
    it('a aprovação sorteada nasce com a revisão cruzada pendente, no mesmo balde do SQL do runbook', async () => {
      const cardId = await cardInReview(SAMPLED_VERSION_ID);

      await cards.approve(firstReviewerId, cardId, { version: 1, reviewDurationMs: 90_000 });

      const sampled = await prisma.knowledgeCardCrossReview.findUniqueOrThrow({
        where: { versionId: SAMPLED_VERSION_ID },
      });
      expect(sampled).toMatchObject({
        cardId,
        status: 'pending',
        firstReviewerId,
        versionAuthorId: authorId,
        sampleBucket: 1,
      });
      const [sql] = await prisma.$queryRawUnsafe<Array<{ bucket: bigint }>>(
        `SELECT ('x' || lpad(left(encode(sha256(convert_to('cc-411:' || id::text, 'UTF8')), 'hex'), 8), 16, '0'))::bit(64)::bigint % 100 AS bucket
           FROM knowledge_card_versions WHERE id = $1::uuid`,
        SAMPLED_VERSION_ID,
      );
      expect(Number(sql?.bucket)).toBe(1);
    });

    it('a aprovação fora da amostra não cria revisão cruzada', async () => {
      const cardId = await cardInReview(UNSAMPLED_VERSION_ID);

      await cards.approve(firstReviewerId, cardId, { version: 1 });

      expect(await prisma.knowledgeCardCrossReview.count({ where: { cardId } })).toBe(0);
    });
  });

  describe('fila', () => {
    it('a revisão cruzada vai para um segundo médico, nunca para quem aprovou ou escreveu', async () => {
      const cardId = await cardInReview(SAMPLED_VERSION_ID);
      await cards.approve(firstReviewerId, cardId, { version: 1 });

      const second = await review.next(secondReviewerId, { skip: [] });
      const first = await review.next(firstReviewerId, { skip: [] });
      const author = await review.next(authorId, { skip: [] });

      expect(second.item).toMatchObject({
        kind: 'cross_review',
        version: 1,
        card: { id: cardId },
        crossReview: { firstReviewer: { id: firstReviewerId } },
      });
      expect(second.pending).toEqual({ review: 0, crossReview: 1 });
      expect(first.item).toBeNull();
      expect(author.item).toBeNull();
      await expect(
        crossReview.agree(
          firstReviewerId,
          (second.item as { crossReview: { id: string } }).crossReview.id,
          {
            reviewDurationMs: 1,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cartão de outra instituição não aparece na fila (ADR-009)', async () => {
      const institution = await prisma.institution.create({ data: { name: 'CC-411 Hospital' } });
      try {
        await cardInReview(UNSAMPLED_VERSION_ID, { institutionId: institution.id });

        const queue = await review.next(secondReviewerId, { skip: [] });

        expect(queue.item).toBeNull();
        expect(queue.pending.review).toBe(0);
      } finally {
        await cleanUp();
        await prisma.institution.delete({ where: { id: institution.id } });
      }
    });
  });

  describe('decisão do segundo médico', () => {
    async function sampledPublishedCard(): Promise<{ cardId: string; crossReviewId: string }> {
      const cardId = await cardInReview(SAMPLED_VERSION_ID);
      await cards.approve(firstReviewerId, cardId, { version: 1 });
      const { id } = await prisma.knowledgeCardCrossReview.findUniqueOrThrow({
        where: { versionId: SAMPLED_VERSION_ID },
      });
      return { cardId, crossReviewId: id };
    }

    it('concordar mantém o cartão no ar e entra na taxa de concordância', async () => {
      const { cardId, crossReviewId } = await sampledPublishedCard();

      const detail = await crossReview.agree(secondReviewerId, crossReviewId, {
        reviewDurationMs: 45_000,
      });

      expect(detail).toMatchObject({ status: 'published', published: { version: 1 } });
      const summary = await crossReview.summary(thirdReviewerId);
      expect(summary).toMatchObject({ sampled: 1, agreed: 1, diverged: 0, agreementRate: 1 });
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: cardId, action: 'CARD_CROSS_REVIEW_AGREED' },
      });
      expect(audit?.payload).toMatchObject({ crossReviewId, version: 1 });
    });

    it('divergir grava a correção, tira o cartão do ar e o devolve à fila com o contexto', async () => {
      const { cardId, crossReviewId } = await sampledPublishedCard();
      const correction = cardInput();
      correction.claims[0]!.dose!.maxDose = null;

      const detail = await crossReview.diverge(secondReviewerId, crossReviewId, {
        reason: 'A dose máxima não vale para esta população',
        reviewDurationMs: 200_000,
        basedOnVersion: 1,
        content: correction,
      });

      expect(detail).toMatchObject({ status: 'in_review', currentVersion: 2, published: null });
      expect(detail.versions[0]).toMatchObject({
        version: 2,
        authorKind: 'physician',
        authorPhysician: { id: secondReviewerId },
      });
      const row = await prisma.knowledgeCardCrossReview.findUniqueOrThrow({
        where: { id: crossReviewId },
      });
      expect(row).toMatchObject({
        status: 'diverged',
        reviewerId: secondReviewerId,
        correctionVersionId: detail.versions[0]!.id,
      });

      const queue = await review.next(thirdReviewerId, { skip: [] });
      expect(queue.item).toMatchObject({
        kind: 'review',
        card: { id: cardId },
        version: 2,
        divergence: {
          crossReviewId,
          disputedVersion: 1,
          firstReviewer: { id: firstReviewerId },
          crossReviewer: { id: secondReviewerId },
          reason: 'A dose máxima não vale para esta população',
        },
      });
      const summary = await crossReview.summary(thirdReviewerId);
      expect(summary).toMatchObject({ diverged: 1, divergenceRate: 1 });
      expect(summary.recentDivergences[0]).toMatchObject({ cardId, correctionVersion: 2 });
    });
  });

  describe('o banco protege a revisão cruzada', () => {
    it('o CHECK recusa o primeiro revisor como segundo médico', async () => {
      const cardId = await cardInReview(SAMPLED_VERSION_ID);
      await cards.approve(firstReviewerId, cardId, { version: 1 });

      await expect(
        prisma.knowledgeCardCrossReview.update({
          where: { versionId: SAMPLED_VERSION_ID },
          data: { status: 'agreed', reviewerId: firstReviewerId, reviewedAt: new Date() },
        }),
      ).rejects.toThrow(/knowledge_card_cross_reviews_second_reviewer_check/);
    });

    it('o CHECK recusa divergência sem a correção', async () => {
      const cardId = await cardInReview(SAMPLED_VERSION_ID);
      await cards.approve(firstReviewerId, cardId, { version: 1 });

      await expect(
        prisma.knowledgeCardCrossReview.update({
          where: { versionId: SAMPLED_VERSION_ID },
          data: {
            status: 'diverged',
            reviewerId: secondReviewerId,
            reviewedAt: new Date(),
            comment: 'sem correção',
          },
        }),
      ).rejects.toThrow(/knowledge_card_cross_reviews_divergence_check/);
    });

    it('o trigger impede regravar a decisão e trocar o sorteio', async () => {
      const cardId = await cardInReview(SAMPLED_VERSION_ID);
      await cards.approve(firstReviewerId, cardId, { version: 1 });
      const { id } = await prisma.knowledgeCardCrossReview.findUniqueOrThrow({
        where: { versionId: SAMPLED_VERSION_ID },
      });
      await crossReview.agree(secondReviewerId, id, { reviewDurationMs: 1_000 });

      await expect(
        prisma.knowledgeCardCrossReview.update({
          where: { id },
          data: { reviewDurationMs: 2_000 },
        }),
      ).rejects.toThrow(/a decisão do segundo médico é gravada uma vez só/);
      await expect(
        prisma.knowledgeCardCrossReview.update({ where: { id }, data: { sampleBucket: 50 } }),
      ).rejects.toThrow(/o sorteio de uma revisão cruzada não muda/);
    });

    it('a role de runtime insere, lê e atualiza, mas não apaga', async () => {
      const privileges = await prisma.$queryRawUnsafe<
        Array<{ privilege: string; granted: boolean }>
      >(
        `SELECT p.privilege, has_table_privilege('copiloto_app', 'knowledge_card_cross_reviews', p.privilege) AS granted
           FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(privilege)`,
      );

      expect(privileges.filter((row) => row.granted).map((row) => row.privilege)).toEqual([
        'SELECT',
        'INSERT',
        'UPDATE',
      ]);
    });
  });
});
