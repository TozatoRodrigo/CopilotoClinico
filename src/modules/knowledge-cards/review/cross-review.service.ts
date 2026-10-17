import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { toJsonValue } from '../../audit/audit-hash';
import { maskFreeText } from '../../copilot/guardrails/pii-filter';
import type { KnowledgeCardDetail } from '../../../shared/contracts/knowledge-cards';
import type {
  KnowledgeCardCrossReviewSummary,
  KnowledgeCardDivergenceSummary,
} from '../../../shared/contracts/knowledge-card-review';
import { prepareCorrection } from '../card-sources';
import { transition } from '../domain/card-lifecycle';
import {
  CROSS_REVIEW_DIVERGENCE_TARGET,
  CROSS_REVIEW_SAMPLE_PERCENT,
  crossReviewerProblem,
  crossReviewRates,
  median,
} from '../domain/cross-review';
import { KNOWLEDGE_CARD_AUDIT_ACTIONS, KNOWLEDGE_CARD_AUDIT_ENTITY } from '../knowledge-card-audit';
import { PHYSICIAN_REF_SELECT, questionOf, toPhysicianRef } from '../knowledge-card-views';
import { contentRejected, KnowledgeCardsService, textSha256 } from '../knowledge-cards.service';
import type { AgreeCrossReviewInput, DivergeCrossReviewInput } from './card-review.schemas';
import { loadReviewerScope } from './review-scope';

/** Divergências recentes no painel. */
const RECENT_DIVERGENCES = 10;
/** Decisões de revisão na mediana do tempo: as mais recentes, para o número acompanhar a fila. */
const REVIEW_TIME_WINDOW = 200;

const TASK_SELECT = {
  id: true,
  cardId: true,
  status: true,
  versionId: true,
  firstReviewerId: true,
  versionAuthorId: true,
  version: { select: { version: true, contentSha256: true } },
} as const satisfies Prisma.KnowledgeCardCrossReviewSelect;

type CrossReviewTask = Prisma.KnowledgeCardCrossReviewGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * CC-411 (ADR-019, adendo) — revisão cruzada de 10% dos cartões aprovados.
 *
 * O sorteio acontece na aprovação (`KnowledgeCardsService.approve`); aqui o
 * segundo médico — nem quem aprovou, nem quem escreveu a versão — concorda
 * ou diverge. Divergir é corrigir: a correção vira versão nova (mesma
 * checagem de citação), o cartão sai do ar (`published_version_id` nulo) e
 * volta para a fila de revisão, onde outro médico decide.
 */
@Injectable()
export class CrossReviewService {
  private readonly logger = new Logger(CrossReviewService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(KnowledgeCardsService) private readonly cards: KnowledgeCardsService,
  ) {}

  async agree(
    reviewerId: string,
    crossReviewId: string,
    input: AgreeCrossReviewInput,
  ): Promise<KnowledgeCardDetail> {
    const task = await this.loadTask(reviewerId, crossReviewId);
    const comment = maskFreeText(input.comment);

    // Um comando só: concorda se ainda está pendente e a versão sorteada
    // continua sendo a publicada de um cartão publicado.
    const decided = await this.prisma.knowledgeCardCrossReview.updateMany({
      where: {
        id: task.id,
        status: 'pending',
        version: { publishedOf: { is: { status: 'published' } } },
      },
      data: {
        status: 'agreed',
        reviewerId,
        reviewedAt: new Date(),
        comment,
        reviewDurationMs: input.reviewDurationMs,
      },
    });
    if (decided.count !== 1) throw this.sampleChanged();

    await this.audit(reviewerId, KNOWLEDGE_CARD_AUDIT_ACTIONS.crossReviewAgreed, task.cardId, {
      crossReviewId: task.id,
      version: task.version.version,
      contentSha256: task.version.contentSha256,
      reviewDurationMs: input.reviewDurationMs,
      commentSha256: textSha256(comment),
    });
    this.logDecision('agreed', task.cardId, task.version.version, input.reviewDurationMs);
    return this.cards.get(task.cardId);
  }

  /**
   * Divergir: grava a correção do segundo médico como versão nova, tira a
   * versão sorteada do ar e devolve o cartão à fila — tudo numa transação,
   * com a divergência registrada. Conteúdo que não passa na checagem de
   * citação: 422 com os problemas, nada gravado.
   */
  async diverge(
    reviewerId: string,
    crossReviewId: string,
    input: DivergeCrossReviewInput,
  ): Promise<KnowledgeCardDetail> {
    const task = await this.loadTask(reviewerId, crossReviewId);
    const card = await this.prisma.knowledgeCard.findUnique({
      where: { id: task.cardId },
      select: {
        status: true,
        institutionId: true,
        currentVersion: true,
        publishedVersionId: true,
        publishedVersion: { select: { content: true } },
      },
    });
    if (!card || card.publishedVersionId !== task.versionId || !card.publishedVersion) {
      throw this.sampleChanged();
    }
    const reopened = transition({ status: card.status, hasPublishedVersion: true }, 'reopen');
    if (!reopened.ok) throw new ConflictException(reopened.reason);
    if (input.basedOnVersion !== task.version.version) {
      throw new ConflictException(
        `A versão publicada é a ${task.version.version}; recarregue antes de divergir`,
      );
    }

    const prepared = await prepareCorrection(this.prisma, input.content, {
      institutionId: card.institutionId,
      previousContent: card.publishedVersion.content,
    });
    if (!prepared.ok) throw contentRejected(prepared.issues);

    const reason = maskFreeText(input.reason);
    const correctionVersion = card.currentVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.knowledgeCard.updateMany({
        where: {
          id: task.cardId,
          status: card.status,
          publishedVersionId: task.versionId,
          currentVersion: card.currentVersion,
        },
        data: { status: reopened.to, currentVersion: correctionVersion, publishedVersionId: null },
      });
      if (moved.count !== 1) throw this.sampleChanged();
      const correction = await tx.knowledgeCardVersion.create({
        data: {
          cardId: task.cardId,
          version: correctionVersion,
          content: toJsonValue({ ...prepared.content }) as Prisma.InputJsonValue,
          contentSha256: prepared.contentSha256,
          authorKind: 'physician',
          authorPhysicianId: reviewerId,
        },
        select: { id: true },
      });
      const decided = await tx.knowledgeCardCrossReview.updateMany({
        where: { id: task.id, status: 'pending' },
        data: {
          status: 'diverged',
          reviewerId,
          reviewedAt: new Date(),
          comment: reason,
          reviewDurationMs: input.reviewDurationMs,
          correctionVersionId: correction.id,
        },
      });
      if (decided.count !== 1) throw this.sampleChanged();
    });

    await this.audit(reviewerId, KNOWLEDGE_CARD_AUDIT_ACTIONS.crossReviewDiverged, task.cardId, {
      crossReviewId: task.id,
      version: task.version.version,
      withdrawnVersionId: task.versionId,
      correctionVersion,
      contentSha256: prepared.contentSha256,
      from: card.status,
      to: reopened.to,
      reviewDurationMs: input.reviewDurationMs,
      reasonSha256: textSha256(reason),
    });
    this.logDecision('diverged', task.cardId, task.version.version, input.reviewDurationMs);
    return this.cards.get(task.cardId);
  }

  /** O painel da taxa de concordância, no escopo do médico. */
  async summary(reviewerId: string): Promise<KnowledgeCardCrossReviewSummary> {
    const scope = await loadReviewerScope(this.prisma, reviewerId);
    const inScope: Prisma.KnowledgeCardCrossReviewWhereInput = { card: scope };

    const [grouped, pendingLive, approvals, recent, durations] = await Promise.all([
      this.prisma.knowledgeCardCrossReview.groupBy({
        by: ['status'],
        where: inScope,
        _count: { _all: true },
      }),
      this.prisma.knowledgeCardCrossReview.count({
        where: { ...inScope, status: 'pending', version: { publishedOf: { isNot: null } } },
      }),
      this.prisma.knowledgeCardVersion.count({
        where: { reviewDecision: 'approved', card: scope },
      }),
      this.prisma.knowledgeCardCrossReview.findMany({
        where: { ...inScope, status: 'diverged' },
        orderBy: { reviewedAt: 'desc' },
        take: RECENT_DIVERGENCES,
        select: {
          id: true,
          comment: true,
          reviewedAt: true,
          card: { select: { id: true, topic: true, status: true } },
          version: { select: { version: true, content: true } },
          correctionVersion: { select: { version: true } },
          firstReviewer: { select: PHYSICIAN_REF_SELECT },
          reviewer: { select: PHYSICIAN_REF_SELECT },
        },
      }),
      this.prisma.knowledgeCardVersion.findMany({
        where: { reviewDurationMs: { not: null }, card: scope },
        orderBy: { reviewedAt: 'desc' },
        take: REVIEW_TIME_WINDOW,
        select: { reviewDurationMs: true },
      }),
    ]);

    const counts = { pending: 0, agreed: 0, diverged: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;
    const reviewDurations = durations.flatMap((row) =>
      row.reviewDurationMs === null ? [] : [row.reviewDurationMs],
    );

    return {
      samplePercent: CROSS_REVIEW_SAMPLE_PERCENT,
      approvals,
      sampled: counts.pending + counts.agreed + counts.diverged,
      pending: pendingLive,
      superseded: counts.pending - pendingLive,
      agreed: counts.agreed,
      diverged: counts.diverged,
      ...crossReviewRates(counts),
      divergenceTarget: CROSS_REVIEW_DIVERGENCE_TARGET,
      reviewTime: { decisions: reviewDurations.length, medianMs: median(reviewDurations) },
      recentDivergences: recent.flatMap((row): KnowledgeCardDivergenceSummary[] => {
        // CHECK da migration: divergência sempre tem revisor, data e motivo.
        if (!row.reviewer || !row.reviewedAt || row.comment === null) return [];
        return [
          {
            crossReviewId: row.id,
            cardId: row.card.id,
            topic: row.card.topic,
            question: questionOf(row.version.content),
            cardStatus: row.card.status,
            disputedVersion: row.version.version,
            correctionVersion: row.correctionVersion?.version ?? null,
            firstReviewer: toPhysicianRef(row.firstReviewer),
            crossReviewer: toPhysicianRef(row.reviewer),
            reason: row.comment,
            reviewedAt: row.reviewedAt.toISOString(),
          },
        ];
      }),
    };
  }

  /**
   * Fora do escopo do médico, 404; já feita, 409; o médico é quem aprovou ou
   * escreveu a versão, 403 — a revisão cruzada é de um segundo médico (o
   * banco também recusa, por CHECK).
   */
  private async loadTask(reviewerId: string, crossReviewId: string): Promise<CrossReviewTask> {
    const scope = await loadReviewerScope(this.prisma, reviewerId);
    const task = await this.prisma.knowledgeCardCrossReview.findFirst({
      where: { id: crossReviewId, card: scope },
      select: TASK_SELECT,
    });
    if (!task) throw new NotFoundException('Revisão cruzada não encontrada');
    if (task.status !== 'pending') {
      throw new ConflictException('Esta revisão cruzada já foi feita');
    }
    const problem = crossReviewerProblem(reviewerId, task);
    if (problem) throw new ForbiddenException(problem);
    return task;
  }

  private sampleChanged(): ConflictException {
    return new ConflictException(
      'O cartão mudou desde o sorteio (outra decisão ou correção); recarregue',
    );
  }

  private async audit(
    actorId: string,
    action: string,
    cardId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditService.log({
        actorId,
        action,
        entity: KNOWLEDGE_CARD_AUDIT_ENTITY,
        entityId: cardId,
        payload,
      });
    } catch (error) {
      this.logger.error(
        `KNOWLEDGE_CARD_AUDIT_FAILED action=${action} card=${cardId}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw error;
    }
  }

  /** Para medir a concordância nos logs, sem texto clínico. */
  private logDecision(
    decision: 'agreed' | 'diverged',
    cardId: string,
    version: number,
    durationMs: number,
  ): void {
    this.logger.log(
      `KNOWLEDGE_CARD_CROSS_REVIEW decision=${decision} card=${cardId} version=${version} durationMs=${durationMs}`,
    );
  }
}
