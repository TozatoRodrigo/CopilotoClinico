import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import type {
  KnowledgeCardContent,
  KnowledgeCardDetail,
} from '../../../shared/contracts/knowledge-cards';
import type {
  KnowledgeCardReviewItem,
  KnowledgeCardReviewQueue,
  KnowledgeCardSourceText,
} from '../../../shared/contracts/knowledge-card-review';
import { loadSourceChunks } from '../card-sources';
import { highlightQuotes, quotesBySource } from '../domain/citation-highlight';
import { chunkTextSha256 } from '../domain/draft-provenance';
import { KnowledgeCardsService } from '../knowledge-cards.service';
import type { CreateKnowledgeCardVersionInput } from '../schemas/knowledge-cards.schemas';
import type {
  ReviewApproveInput,
  ReviewQueueQueryInput,
  ReviewRejectInput,
} from './card-review.schemas';
import { reviewScopeWhere } from './review-scope';

/**
 * CC-404 (ADR-019, adendo) — a fila de revisão do celular: um cartão por vez,
 * do que espera há mais tempo para o mais recente, só no escopo do revisor
 * (globais e os da instituição dele).
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
    const inQueue: Prisma.KnowledgeCardWhereInput = {
      AND: [await this.scopeOf(reviewerId), { status: 'in_review' }],
    };
    const [pending, first] = await Promise.all([
      this.prisma.knowledgeCard.count({ where: inQueue }),
      this.prisma.knowledgeCard.findFirst({
        where: query.skip.length > 0 ? { AND: [inQueue, { id: { notIn: query.skip } }] } : inQueue,
        // O que espera há mais tempo primeiro; `id` desempata para a ordem ser estável.
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ]);
    return { item: first ? await this.reviewItem(first.id) : null, pending };
  }

  /** "Corrigir": versão nova do revisor, com a mesma checagem de citação (422 com os problemas). */
  async correct(
    reviewerId: string,
    cardId: string,
    input: CreateKnowledgeCardVersionInput,
  ): Promise<KnowledgeCardReviewItem> {
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

  private async scopeOf(reviewerId: string): Promise<Prisma.KnowledgeCardWhereInput> {
    const links = await this.prisma.physicianInstitution.findMany({
      where: { physicianId: reviewerId },
      select: { institutionId: true },
    });
    return reviewScopeWhere(links.map((link) => link.institutionId));
  }

  /**
   * A fila do revisor é o limite do papel: fora do escopo dele, 404 (não
   * confirma que o cartão existe); fora de revisão, 409 — outro revisor
   * decidiu antes, e a tela passa ao próximo.
   */
  private async assertInQueue(reviewerId: string, cardId: string): Promise<void> {
    const card = await this.prisma.knowledgeCard.findFirst({
      where: { AND: [{ id: cardId }, await this.scopeOf(reviewerId)] },
      select: { status: true },
    });
    if (!card) throw new NotFoundException('Cartão não encontrado');
    if (card.status !== 'in_review') {
      throw new ConflictException('Este cartão já saiu da fila de revisão');
    }
  }

  private async reviewItem(cardId: string): Promise<KnowledgeCardReviewItem> {
    const card = await this.cards.get(cardId);
    const latest = card.versions[0];
    if (!latest) throw new Error(`KNOWLEDGE_CARD_WITHOUT_VERSION card=${cardId}`);
    return {
      kind: 'review',
      card,
      version: latest.version,
      sourceTexts: await this.sourceTexts(latest.content),
    };
  }

  /** Texto integral de cada fonte, com os trechos citados pela versão destacados. */
  private async sourceTexts(content: KnowledgeCardContent): Promise<KnowledgeCardSourceText[]> {
    const chunks = await loadSourceChunks(
      this.prisma,
      content.sources.map((source) => source.chunkId),
    );
    const quotes = quotesBySource(content);
    return content.sources.map((source) => {
      const text = chunks.get(source.chunkId)?.text ?? null;
      return {
        key: source.key,
        chunkId: source.chunkId,
        text,
        matchesCitedText: text !== null && chunkTextSha256(text) === source.chunkSha256,
        highlights: text === null ? [] : highlightQuotes(text, quotes.get(source.key) ?? []),
      };
    });
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
