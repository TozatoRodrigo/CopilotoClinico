import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import type { KnowledgeCardDetail } from '../../../shared/contracts/knowledge-cards';
import type {
  KnowledgeCardCrossReviewItem,
  KnowledgeCardDivergence,
  KnowledgeCardReviewQueue,
  KnowledgeCardReviewTaskItem,
} from '../../../shared/contracts/knowledge-card-review';
import { KnowledgeCardsService } from '../knowledge-cards.service';
import { PHYSICIAN_REF_SELECT, toPhysicianRef } from '../knowledge-card-views';
import type { CreateKnowledgeCardVersionInput } from '../schemas/knowledge-cards.schemas';
import type {
  ReviewApproveInput,
  ReviewQueueQueryInput,
  ReviewRejectInput,
} from './card-review.schemas';
import { availableCrossReviewWhere, loadReviewerScope } from './review-scope';
import { loadReviewSourceTexts } from './review-sources';

/** O que a fila precisa de uma revisão cruzada pendente para montar a vista. */
const CROSS_REVIEW_TASK_SELECT = {
  id: true,
  cardId: true,
  version: { select: { version: true, reviewedAt: true, validUntil: true } },
  firstReviewer: { select: PHYSICIAN_REF_SELECT },
} as const satisfies Prisma.KnowledgeCardCrossReviewSelect;

type CrossReviewTaskRow = Prisma.KnowledgeCardCrossReviewGetPayload<{
  select: typeof CROSS_REVIEW_TASK_SELECT;
}>;

/**
 * CC-404 (ADR-019, adendo) — a fila de revisão do celular: um cartão por vez,
 * do que espera há mais tempo para o mais recente, só no escopo do revisor
 * (globais e os da instituição dele).
 *
 * CC-411 — as revisões cruzadas que o médico pode fazer vêm antes: são
 * cartões no ar, e o erro que a segunda leitura pega está chegando ao médico.
 *
 * As decisões são as do console (`KnowledgeCardsService`: versão vista, 409
 * se mudou, CRM verificado para aprovar, trilha de auditoria); aqui só se
 * garante que o cartão está na fila deste revisor e se monta a vista com o
 * texto das fontes e os trechos citados destacados.
 */
@Injectable()
export class CardReviewService {
  private readonly logger = new Logger(CardReviewService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KnowledgeCardsService) private readonly cards: KnowledgeCardsService,
  ) {}

  async next(reviewerId: string, query: ReviewQueueQueryInput): Promise<KnowledgeCardReviewQueue> {
    const scope = await loadReviewerScope(this.prisma, reviewerId);
    const inQueue: Prisma.KnowledgeCardWhereInput = { AND: [scope, { status: 'in_review' }] };
    const crossReviews = availableCrossReviewWhere(reviewerId, scope);
    const skipped = query.skip.length > 0;

    const [review, crossReview, nextCrossReview] = await Promise.all([
      this.prisma.knowledgeCard.count({ where: inQueue }),
      this.prisma.knowledgeCardCrossReview.count({ where: crossReviews }),
      this.prisma.knowledgeCardCrossReview.findFirst({
        where: skipped ? { AND: [crossReviews, { cardId: { notIn: query.skip } }] } : crossReviews,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: CROSS_REVIEW_TASK_SELECT,
      }),
    ]);
    const pending = { review, crossReview };
    if (nextCrossReview) return { item: await this.crossReviewItem(nextCrossReview), pending };

    const first = await this.prisma.knowledgeCard.findFirst({
      where: skipped ? { AND: [inQueue, { id: { notIn: query.skip } }] } : inQueue,
      // O que espera há mais tempo primeiro; `id` desempata para a ordem ser estável.
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return { item: first ? await this.reviewItem(first.id) : null, pending };
  }

  /** "Corrigir": versão nova do revisor, com a mesma checagem de citação (422 com os problemas). */
  async correct(
    reviewerId: string,
    cardId: string,
    input: CreateKnowledgeCardVersionInput,
  ): Promise<KnowledgeCardReviewTaskItem> {
    await this.assertInQueue(reviewerId, cardId);
    const card = await this.cards.createVersion(reviewerId, cardId, input);
    this.logDecision('corrected', cardId, card.currentVersion, null);
    return this.reviewItem(cardId);
  }

  async approve(
    reviewerId: string,
    cardId: string,
    input: ReviewApproveInput,
  ): Promise<KnowledgeCardDetail> {
    await this.assertInQueue(reviewerId, cardId);
    const card = await this.cards.approve(reviewerId, cardId, input);
    this.logDecision('approved', cardId, input.version, input.reviewDurationMs);
    return card;
  }

  async reject(
    reviewerId: string,
    cardId: string,
    input: ReviewRejectInput,
  ): Promise<KnowledgeCardDetail> {
    await this.assertInQueue(reviewerId, cardId);
    const card = await this.cards.reject(reviewerId, cardId, input);
    this.logDecision('rejected', cardId, input.version, input.reviewDurationMs);
    return card;
  }

  /**
   * A fila do revisor é o limite do papel: fora do escopo dele, 404 (não
   * confirma que o cartão existe); fora de revisão, 409 — outro revisor
   * decidiu antes, e a tela passa ao próximo.
   */
  private async assertInQueue(reviewerId: string, cardId: string): Promise<void> {
    const card = await this.prisma.knowledgeCard.findFirst({
      where: { AND: [{ id: cardId }, await loadReviewerScope(this.prisma, reviewerId)] },
      select: { status: true },
    });
    if (!card) throw new NotFoundException('Cartão não encontrado');
    if (card.status !== 'in_review') {
      throw new ConflictException('Este cartão já saiu da fila de revisão');
    }
  }

  private async reviewItem(cardId: string): Promise<KnowledgeCardReviewTaskItem> {
    const card = await this.cards.get(cardId);
    const latest = card.versions[0];
    if (!latest) throw new Error(`KNOWLEDGE_CARD_WITHOUT_VERSION card=${cardId}`);
    const [sourceTexts, divergence] = await Promise.all([
      loadReviewSourceTexts(this.prisma, latest.content),
      this.divergenceOf(card),
    ]);
    return { kind: 'review', card, version: latest.version, sourceTexts, divergence };
  }

  private async crossReviewItem(task: CrossReviewTaskRow): Promise<KnowledgeCardCrossReviewItem> {
    const card = await this.cards.get(task.cardId);
    const sampled = card.versions.find((version) => version.version === task.version.version);
    // CHECK da migration CC-402: versão aprovada sempre tem data e validade.
    if (!sampled || !task.version.reviewedAt || !task.version.validUntil) {
      throw new Error(`KNOWLEDGE_CARD_CROSS_REVIEW_INVALID crossReview=${task.id}`);
    }
    return {
      kind: 'cross_review',
      card,
      version: sampled.version,
      sourceTexts: await loadReviewSourceTexts(this.prisma, sampled.content),
      crossReview: {
        id: task.id,
        firstReviewer: toPhysicianRef(task.firstReviewer),
        approvedAt: task.version.reviewedAt.toISOString(),
        validUntil: task.version.validUntil.toISOString(),
      },
    };
  }

  /**
   * CC-411 — cartão que voltou à fila porque a revisão cruzada divergiu: o
   * revisor vê de quem discordou, por quê e qual versão saiu do ar. Depois de
   * uma nova aprovação o cartão volta a ter versão publicada e o contexto sai.
   */
  private async divergenceOf(card: KnowledgeCardDetail): Promise<KnowledgeCardDivergence | null> {
    if (card.published) return null;
    const diverged = await this.prisma.knowledgeCardCrossReview.findFirst({
      where: { cardId: card.id, status: 'diverged' },
      orderBy: { reviewedAt: 'desc' },
      select: {
        id: true,
        comment: true,
        reviewedAt: true,
        version: { select: { version: true } },
        firstReviewer: { select: PHYSICIAN_REF_SELECT },
        reviewer: { select: PHYSICIAN_REF_SELECT },
      },
    });
    // CHECK da migration CC-411: divergência sempre tem revisor, data e motivo.
    if (!diverged?.reviewer || !diverged.reviewedAt || diverged.comment === null) return null;
    return {
      crossReviewId: diverged.id,
      disputedVersion: diverged.version.version,
      firstReviewer: toPhysicianRef(diverged.firstReviewer),
      crossReviewer: toPhysicianRef(diverged.reviewer),
      reason: diverged.comment,
      reviewedAt: diverged.reviewedAt.toISOString(),
    };
  }

  /** Para medir a fila (tempo por cartão, decisões por dia) sem texto clínico no log. */
  private logDecision(
    decision: 'approved' | 'rejected' | 'corrected',
    cardId: string,
    version: number,
    durationMs: number | null,
  ): void {
    this.logger.log(
      `KNOWLEDGE_CARD_REVIEW decision=${decision} card=${cardId} version=${version}` +
        (durationMs === null ? '' : ` durationMs=${durationMs}`),
    );
  }
}
