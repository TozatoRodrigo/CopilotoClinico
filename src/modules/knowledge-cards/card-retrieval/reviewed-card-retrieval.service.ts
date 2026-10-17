import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../config/prisma.service';
import type { ReviewedCard } from '../../../shared/contracts/knowledge-cards';
import { CardIndexService } from '../card-index/card-index.service';
import type { CardSearchUnavailableReason } from '../card-index/card-search';
import {
  CARD_RELEVANCE_GATE,
  type CardCandidate,
  type CardRelevanceContext,
  type CardRelevanceGate,
  type CardRelevanceReason,
  type CardRelevanceVerdict,
} from './card-relevance-gate';
import { REVIEWED_CARD_SELECT, toReviewedCard } from './reviewed-card-view';
import {
  REVIEWED_CARD_CANDIDATES_PER_QUERY,
  readReviewedCardsSettings,
} from './reviewed-cards.settings';

export interface ApplicableCardsRequest extends CardRelevanceContext {
  /**
   * Consultas curtas e sem dado de paciente: as `searchQueries` da Etapa 1
   * (ADR-013) ou, na CC-501, a pergunta já de-identificada.
   */
  queries: readonly string[];
  /** ADR-009 — instituição do atendimento: cartões globais + os dela. */
  institutionId: string | null;
}

export interface ApplicableCard {
  card: ReviewedCard;
  similarity: number;
}

/**
 * O que a busca e o portão fizeram, para o log e a trilha técnica da análise
 * (`params`). Sem texto: contagens, motivos e o nome do portão.
 */
export interface ApplicableCardsTrace {
  status: 'ok' | 'gate_failed' | CardSearchUnavailableReason;
  gate: string;
  candidates: number;
  accepted: number;
  rejected: Partial<Record<CardRelevanceReason, number>>;
}

export interface ApplicableCardsResult {
  /** Do mais ao menos parecido, até `REVIEWED_CARDS_MAX`. */
  cards: ApplicableCard[];
  trace: ApplicableCardsTrace;
}

/**
 * CC-408 (ADR-019) — cartões revisados que se aplicam a um caso: busca
 * semântica no índice (CC-406), carga da versão publicada com o revisor e o
 * portão de relevância (`CARD_RELEVANCE_GATE`; a CC-407 troca o portão).
 *
 * Reutilizável fora da decisão: a pergunta rápida da CC-501 chama o mesmo
 * método com a pergunta como consulta e como hipótese.
 *
 * Nenhum cartão aplicável é uma lacuna (`REVIEWED_CARDS_GAP` no log) — o
 * ponto onde a CC-409 vai registrar a fila de criação de cartões.
 */
@Injectable()
export class ReviewedCardRetrievalService {
  private readonly logger = new Logger(ReviewedCardRetrievalService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CardIndexService) private readonly cardIndex: CardIndexService,
    @Inject(CARD_RELEVANCE_GATE) private readonly gate: CardRelevanceGate,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async findApplicable(request: ApplicableCardsRequest): Promise<ApplicableCardsResult> {
    const search = await this.cardIndex.search({
      queries: request.queries,
      institutionId: request.institutionId,
      limitPerQuery: REVIEWED_CARD_CANDIDATES_PER_QUERY,
    });
    if (search.status === 'unavailable') {
      return this.finish(request, [], this.trace(search.reason, 0, []));
    }

    const candidates = await this.loadCandidates(search.hits);
    if (candidates.length === 0) return this.finish(request, [], this.trace('ok', 0, []));

    let verdicts: CardRelevanceVerdict[];
    try {
      verdicts = await this.gate.judge(candidates, request);
    } catch (error) {
      // Portão fora do ar (CC-407: API externa) não pode liberar dose sem
      // julgamento: nenhum cartão nesta análise, e o erro vai para o Sentry.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`REVIEWED_CARDS_GATE_FAILED gate=${this.gate.name}: ${reason}`);
      Sentry.captureMessage(
        `REVIEWED_CARDS_GATE_FAILED gate=${this.gate.name}: ${reason}`,
        'error',
      );
      return this.finish(request, [], this.trace('gate_failed', candidates.length, []));
    }

    const applies = new Set(
      verdicts.filter((verdict) => verdict.applies).map((verdict) => verdict.cardId),
    );
    const { maxCards } = readReviewedCardsSettings(this.config);
    const accepted = candidates
      .filter((candidate) => applies.has(candidate.card.cardId))
      .slice(0, maxCards);
    const rejectedReasons = verdicts
      .filter((verdict) => !verdict.applies)
      .map((verdict) => verdict.reason);
    return this.finish(
      request,
      accepted,
      this.trace('ok', candidates.length, rejectedReasons, accepted.length),
    );
  }

  /**
   * Versões publicadas dos cartões achados, na ordem da busca. O índice pode
   * estar um passo atrás (versão nova publicada há instantes): vale a versão
   * publicada agora, e o cartão sem versão válida fica de fora.
   */
  private async loadCandidates(
    hits: ReadonlyArray<{ cardId: string; similarity: number }>,
  ): Promise<CardCandidate[]> {
    if (hits.length === 0) return [];
    const rows = await this.prisma.knowledgeCard.findMany({
      where: { id: { in: hits.map((hit) => hit.cardId) } },
      select: REVIEWED_CARD_SELECT,
    });
    const now = Date.now();
    const cards = new Map(
      rows.flatMap((row) => {
        const card = toReviewedCard(row);
        return card && new Date(card.validUntil).getTime() > now ? [[card.cardId, card]] : [];
      }),
    );
    return hits.flatMap((hit) => {
      const card = cards.get(hit.cardId);
      return card ? [{ card, similarity: hit.similarity }] : [];
    });
  }

  private trace(
    status: ApplicableCardsTrace['status'],
    candidates: number,
    rejectedReasons: readonly CardRelevanceReason[],
    accepted = 0,
  ): ApplicableCardsTrace {
    const rejected: ApplicableCardsTrace['rejected'] = {};
    for (const reason of rejectedReasons) rejected[reason] = (rejected[reason] ?? 0) + 1;
    return { status, gate: this.gate.name, candidates, accepted, rejected };
  }

  private finish(
    request: ApplicableCardsRequest,
    cards: ApplicableCard[],
    trace: ApplicableCardsTrace,
  ): ApplicableCardsResult {
    const rejected = Object.entries(trace.rejected)
      .map(([reason, count]) => `${reason}:${count}`)
      .join(',');
    this.logger.log(
      `REVIEWED_CARDS status=${trace.status} gate=${trace.gate} syndrome=${request.syndrome ?? '-'} ` +
        `candidates=${trace.candidates} accepted=${trace.accepted} rejected=${rejected || '-'} ` +
        `cards=[${cards.map(({ card, similarity }) => `${card.cardId}:v${card.version}:${similarity.toFixed(3)}`).join(',')}]`,
    );
    if (cards.length === 0 && trace.status === 'ok') {
      this.logger.log(
        `REVIEWED_CARDS_GAP syndrome=${request.syndrome ?? '-'} candidates=${trace.candidates}`,
      );
    }
    return { cards, trace };
  }
}
