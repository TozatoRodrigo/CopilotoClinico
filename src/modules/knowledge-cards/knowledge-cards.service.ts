import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { KnowledgeCardStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { sha256Hex, toJsonValue } from '../audit/audit-hash';
import { maskFreeText } from '../copilot/guardrails/pii-filter';
import {
  KNOWLEDGE_CARD_DISPLAY_STATUSES,
  type KnowledgeCardDetail,
  type KnowledgeCardDisplayStatus,
  type KnowledgeCardListPage,
} from '../../shared/contracts/knowledge-cards';
import { KnowledgeCardContentSchema } from './domain/card-content';
import {
  DEFAULT_VALIDITY_MONTHS,
  transition,
  validUntilFrom,
  type KnowledgeCardAction,
} from './domain/card-lifecycle';
import { loadSourceChunks, prepareCardContent, requestedChunkIds } from './card-sources';
import { KNOWLEDGE_CARD_AUDIT_ACTIONS, KNOWLEDGE_CARD_AUDIT_ENTITY } from './knowledge-card-audit';
import {
  CARD_DETAIL_SELECT,
  CARD_SUMMARY_SELECT,
  toCardDetail,
  toCardSummary,
} from './knowledge-card-views';
import type {
  ApproveKnowledgeCardInput,
  ArchiveKnowledgeCardInput,
  CreateKnowledgeCardVersionInput,
  ListKnowledgeCardsQueryInput,
  RejectKnowledgeCardInput,
  SubmitKnowledgeCardInput,
} from './schemas/knowledge-cards.schemas';

/** O que a transição precisa saber do cartão e da versão mais recente. */
const CARD_STATE_SELECT = {
  id: true,
  status: true,
  institutionId: true,
  currentVersion: true,
  publishedVersionId: true,
  versions: {
    orderBy: { version: 'desc' },
    take: 1,
    select: { id: true, version: true, contentSha256: true, content: true },
  },
} as const satisfies Prisma.KnowledgeCardSelect;

type CardState = Prisma.KnowledgeCardGetPayload<{ select: typeof CARD_STATE_SELECT }>;

/** Texto livre vai mascarado para o banco e só como hash para a trilha (sem texto livre no payload). */
function textSha256(text: string | null): string | null {
  return text ? sha256Hex(text) : null;
}

function displayStatusWhere(
  displayStatus: KnowledgeCardDisplayStatus,
  now: Date,
): Prisma.KnowledgeCardWhereInput {
  switch (displayStatus) {
    case 'needs_review':
      return { status: 'published', publishedVersion: { validUntil: { lt: now } } };
    case 'published':
      return { status: 'published', publishedVersion: { validUntil: { gte: now } } };
    default:
      return { status: displayStatus };
  }
}

/**
 * CC-402 (ADR-017) — ciclo de vida do cartão revisado: listar, ver, corrigir
 * (versão nova), enviar para revisão, aprovar, rejeitar e arquivar. Cada
 * transição grava um evento na trilha de auditoria, com a versão e o hash do
 * conteúdo, e nunca texto livre.
 *
 * Toda transição recebe a versão que a pessoa viu: se outra versão entrou no
 * meio (ou outra pessoa decidiu antes), 409 — ninguém assina o que não leu.
 */
@Injectable()
export class KnowledgeCardsService {
  private readonly logger = new Logger(KnowledgeCardsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async list(query: ListKnowledgeCardsQueryInput): Promise<KnowledgeCardListPage> {
    const now = new Date();
    const scope: Prisma.KnowledgeCardWhereInput = {
      ...(query.syndrome ? { syndrome: query.syndrome } : {}),
      ...(query.institutionId ? { institutionId: query.institutionId } : {}),
    };
    const where: Prisma.KnowledgeCardWhereInput = query.displayStatus
      ? { AND: [scope, displayStatusWhere(query.displayStatus, now)] }
      : scope;

    const [rows, total, grouped, expired] = await Promise.all([
      this.prisma.knowledgeCard.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: CARD_SUMMARY_SELECT,
      }),
      this.prisma.knowledgeCard.count({ where }),
      this.prisma.knowledgeCard.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      this.prisma.knowledgeCard.count({
        where: { AND: [scope, displayStatusWhere('needs_review', now)] },
      }),
    ]);

    const countsByDisplayStatus = Object.fromEntries(
      KNOWLEDGE_CARD_DISPLAY_STATUSES.map((status) => [status, 0]),
    ) as Record<KnowledgeCardDisplayStatus, number>;
    for (const row of grouped) countsByDisplayStatus[row.status] = row._count._all;
    countsByDisplayStatus.published -= expired;
    countsByDisplayStatus.needs_review = expired;

    return {
      items: rows.map((row) => toCardSummary(row, now)),
      total,
      countsByDisplayStatus,
    };
  }

  async get(cardId: string): Promise<KnowledgeCardDetail> {
    const row = await this.prisma.knowledgeCard.findUnique({
      where: { id: cardId },
      select: CARD_DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Cartão não encontrado');
    return toCardDetail(row, new Date());
  }

  /**
   * "Corrigir" (CC-404): o conteúdo inteiro da versão nova, escrita pelo
   * médico. Passa pelas mesmas regras do rascunho da IA — formato, fonte
   * elegível e checagem de citação — e devolve 422 com os problemas. A versão
   * publicada continua valendo até a nova ser aprovada.
   */
  async createVersion(
    actorId: string,
    cardId: string,
    input: CreateKnowledgeCardVersionInput,
  ): Promise<KnowledgeCardDetail> {
    const card = await this.loadState(cardId);
    const to = this.assertTransition(card, 'edit');
    const latest = this.assertLatestVersion(card, input.basedOnVersion);

    const previous = KnowledgeCardContentSchema.safeParse(latest.content);
    const alreadyCited = new Set(
      previous.success ? previous.data.sources.map((source) => source.chunkId) : [],
    );
    const chunks = await loadSourceChunks(this.prisma, requestedChunkIds(input.content));
    const prepared = prepareCardContent(input.content, chunks, {
      institutionId: card.institutionId,
      alreadyCitedChunkIds: alreadyCited,
    });
    if (!prepared.ok) {
      throw new UnprocessableEntityException({
        message: 'O conteúdo não pode ser gravado',
        issues: prepared.issues,
      });
    }

    const nextVersion = card.currentVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeCard.updateMany({
        where: { id: cardId, status: card.status, currentVersion: card.currentVersion },
        data: { status: to, currentVersion: nextVersion },
      });
      if (updated.count !== 1) throw this.concurrentChange();
      await tx.knowledgeCardVersion.create({
        data: {
          cardId,
          version: nextVersion,
          content: toJsonValue({ ...prepared.content }) as Prisma.InputJsonValue,
          contentSha256: prepared.contentSha256,
          authorKind: 'physician',
          authorPhysicianId: actorId,
        },
      });
    });

    await this.audit(actorId, KNOWLEDGE_CARD_AUDIT_ACTIONS.versionCreated, cardId, {
      version: nextVersion,
      basedOnVersion: input.basedOnVersion,
      contentSha256: prepared.contentSha256,
      from: card.status,
      to,
    });
    return this.get(cardId);
  }

  async submit(
    actorId: string,
    cardId: string,
    input: SubmitKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    const card = await this.loadState(cardId);
    const to = this.assertTransition(card, 'submit');
    const latest = this.assertLatestVersion(card, input.version);

    await this.moveStatus(card, to);
    await this.audit(actorId, KNOWLEDGE_CARD_AUDIT_ACTIONS.submitted, cardId, {
      version: latest.version,
      contentSha256: latest.contentSha256,
      from: card.status,
      to,
    });
    return this.get(cardId);
  }

  /**
   * CC-402, critérios 1 e 2 — aprovar exige CRM verificado (403 sem ele) e
   * grava revisor, data, versão, validade e o hash do conteúdo assinado. A
   * versão aprovada passa a ser a publicada.
   */
  async approve(
    reviewerId: string,
    cardId: string,
    input: ApproveKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    await this.assertVerifiedReviewer(reviewerId);
    const card = await this.loadState(cardId);
    const to = this.assertTransition(card, 'approve');
    const latest = this.assertLatestVersion(card, input.version);

    const reviewedAt = new Date();
    const validUntil = validUntilFrom(reviewedAt, input.validityMonths ?? DEFAULT_VALIDITY_MONTHS);
    const comment = maskFreeText(input.comment);

    await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.knowledgeCardVersion.updateMany({
        where: { id: latest.id, reviewDecision: null },
        data: {
          reviewDecision: 'approved',
          reviewerId,
          reviewedAt,
          reviewComment: comment,
          reviewDurationMs: input.reviewDurationMs ?? null,
          validUntil,
        },
      });
      const published = await tx.knowledgeCard.updateMany({
        where: { id: cardId, status: card.status, currentVersion: latest.version },
        data: { status: to, publishedVersionId: latest.id },
      });
      if (reviewed.count !== 1 || published.count !== 1) throw this.concurrentChange();
    });

    await this.audit(reviewerId, KNOWLEDGE_CARD_AUDIT_ACTIONS.approved, cardId, {
      version: latest.version,
      contentSha256: latest.contentSha256,
      previousPublishedVersionId: card.publishedVersionId,
      validUntil: validUntil.toISOString(),
      reviewDurationMs: input.reviewDurationMs ?? null,
      commentSha256: textSha256(comment),
    });
    return this.get(cardId);
  }

  /**
   * "Descartar" (CC-404). Sem versão publicada, o cartão é arquivado; numa
   * correção de cartão publicado, só a correção cai e a versão assinada segue.
   */
  async reject(
    reviewerId: string,
    cardId: string,
    input: RejectKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    const card = await this.loadState(cardId);
    const to = this.assertTransition(card, 'reject');
    const latest = this.assertLatestVersion(card, input.version);

    const reviewedAt = new Date();
    const reason = maskFreeText(input.reason);

    await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.knowledgeCardVersion.updateMany({
        where: { id: latest.id, reviewDecision: null },
        data: {
          reviewDecision: 'rejected',
          reviewerId,
          reviewedAt,
          reviewComment: reason,
          reviewDurationMs: input.reviewDurationMs ?? null,
        },
      });
      const moved = await tx.knowledgeCard.updateMany({
        where: { id: cardId, status: card.status, currentVersion: latest.version },
        data: { status: to, archivedAt: to === 'archived' ? reviewedAt : null },
      });
      if (reviewed.count !== 1 || moved.count !== 1) throw this.concurrentChange();
    });

    await this.audit(reviewerId, KNOWLEDGE_CARD_AUDIT_ACTIONS.rejected, cardId, {
      version: latest.version,
      contentSha256: latest.contentSha256,
      from: card.status,
      to,
      reviewDurationMs: input.reviewDurationMs ?? null,
      reasonSha256: textSha256(reason),
    });
    return this.get(cardId);
  }

  /** Tira o cartão de uso, publicado ou não. Final: não volta. */
  async archive(
    actorId: string,
    cardId: string,
    input: ArchiveKnowledgeCardInput,
  ): Promise<KnowledgeCardDetail> {
    const card = await this.loadState(cardId);
    const to = this.assertTransition(card, 'archive');

    const reason = maskFreeText(input.reason);
    await this.moveStatus(card, to, { archivedAt: new Date(), archivedReason: reason });
    await this.audit(actorId, KNOWLEDGE_CARD_AUDIT_ACTIONS.archived, cardId, {
      version: card.currentVersion,
      from: card.status,
      to,
      reasonSha256: textSha256(reason),
    });
    return this.get(cardId);
  }

  private async loadState(cardId: string): Promise<CardState> {
    const card = await this.prisma.knowledgeCard.findUnique({
      where: { id: cardId },
      select: CARD_STATE_SELECT,
    });
    if (!card) throw new NotFoundException('Cartão não encontrado');
    return card;
  }

  private assertTransition(card: CardState, action: KnowledgeCardAction): KnowledgeCardStatus {
    const result = transition(
      { status: card.status, hasPublishedVersion: card.publishedVersionId !== null },
      action,
    );
    if (!result.ok) throw new ConflictException(result.reason);
    return result.to;
  }

  private assertLatestVersion(card: CardState, seenVersion: number): CardState['versions'][number] {
    const latest = card.versions[0];
    if (!latest || latest.version !== card.currentVersion || seenVersion !== card.currentVersion) {
      throw new ConflictException(
        `O cartão está na versão ${card.currentVersion}; recarregue antes de decidir`,
      );
    }
    return latest;
  }

  private async assertVerifiedReviewer(reviewerId: string): Promise<void> {
    const reviewer = await this.prisma.physician.findUnique({
      where: { id: reviewerId },
      select: { crmVerified: true },
    });
    if (!reviewer?.crmVerified) {
      throw new ForbiddenException('Aprovar um cartão exige CRM verificado');
    }
  }

  private async moveStatus(
    card: CardState,
    to: KnowledgeCardStatus,
    extra: Prisma.KnowledgeCardUpdateManyMutationInput = {},
  ): Promise<void> {
    const moved = await this.prisma.knowledgeCard.updateMany({
      where: { id: card.id, status: card.status, currentVersion: card.currentVersion },
      data: { ...extra, status: to },
    });
    if (moved.count !== 1) throw this.concurrentChange();
  }

  private concurrentChange(): ConflictException {
    return new ConflictException('O cartão mudou enquanto a decisão era gravada; recarregue');
  }

  /**
   * A transição já foi gravada; a trilha é o registro médico-legal dela. Se a
   * gravação na trilha falhar, o erro sobe (500) e vai para o Sentry pelo
   * filtro global — nunca some em silêncio.
   */
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
}
