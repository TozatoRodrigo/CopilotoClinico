import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../config/prisma.service';
import {
  REVIEWED_CARD_ID,
  reviewedCard,
  reviewedCardRow,
} from '../../../../tests/fixtures/reviewed-cards';
import type { CardIndexService } from '../card-index/card-index.service';
import type { CardSearchOutcome } from '../card-index/card-search';
import { SimilarityThemeGate, type CardRelevanceGate } from './card-relevance-gate';
import {
  ReviewedCardRetrievalService,
  type ApplicableCardsRequest,
} from './reviewed-card-retrieval.service';

const CARD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARD_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const request: ApplicableCardsRequest = {
  queries: ['meningite bacteriana antibiótico empírico'],
  institutionId: 'inst-1',
  syndrome: 'febre',
  hypotheses: ['Meningite bacteriana'],
  problemRepresentation: 'Adulto com febre e rigidez de nuca',
};

function hit(cardId: string, similarity: number) {
  return { cardId, versionId: 'v', similarity, queryIndexes: [0] };
}

describe('ReviewedCardRetrievalService (CC-408)', () => {
  let search: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;

  function service(gate?: CardRelevanceGate) {
    const config = new ConfigService(env);
    return new ReviewedCardRetrievalService(
      { knowledgeCard: { findMany } } as unknown as PrismaService,
      { search } as unknown as CardIndexService,
      gate ?? new SimilarityThemeGate(config),
      config,
    );
  }

  beforeEach(() => {
    env = {};
    search = vi.fn();
    findMany = vi
      .fn()
      .mockResolvedValue([
        reviewedCardRow(),
        reviewedCardRow({ id: CARD_B, syndrome: 'dor-toracica' }),
        reviewedCardRow({ id: CARD_C }),
      ]);
  });

  it('busca pelas consultas na instituição do caso e devolve só o que o portão aceita', async () => {
    search.mockResolvedValue({
      status: 'ok',
      hits: [hit(REVIEWED_CARD_ID, 0.81), hit(CARD_B, 0.79), hit(CARD_C, 0.3)],
    } satisfies CardSearchOutcome);

    const result = await service().findApplicable(request);

    expect(search).toHaveBeenCalledWith({
      queries: request.queries,
      institutionId: 'inst-1',
      limitPerQuery: 8,
    });
    expect(result.cards).toEqual([{ card: reviewedCard(), similarity: 0.81 }]);
    expect(result.trace).toEqual({
      status: 'ok',
      gate: 'similarity-theme',
      fallback: null,
      candidates: 3,
      accepted: 1,
      rejected: { syndrome_mismatch: 1, below_similarity: 1 },
    });
  });

  it('respeita o teto de cartões por análise, do mais parecido ao menos', async () => {
    env = { REVIEWED_CARDS_MAX: '1' };
    search.mockResolvedValue({
      status: 'ok',
      hits: [hit(CARD_C, 0.9), hit(REVIEWED_CARD_ID, 0.8)],
    });

    const result = await service().findApplicable(request);

    expect(result.cards.map(({ card }) => card.cardId)).toEqual([CARD_C]);
  });

  it('sem busca (embedding desligado), sem cartão e sem consulta ao banco', async () => {
    search.mockResolvedValue({ status: 'unavailable', reason: 'embeddings_disabled' });

    const result = await service().findApplicable(request);

    expect(result).toEqual({
      cards: [],
      trace: {
        status: 'embeddings_disabled',
        gate: 'similarity-theme',
        fallback: null,
        candidates: 0,
        accepted: 0,
        rejected: {},
      },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('deixa de fora o cartão que perdeu a validade, o arquivado e o que sumiu', async () => {
    findMany.mockResolvedValue([
      reviewedCardRow({
        publishedVersion: {
          ...reviewedCardRow().publishedVersion!,
          validUntil: new Date('2020-01-01T00:00:00.000Z'),
        },
      }),
      reviewedCardRow({ id: CARD_B, status: 'archived' }),
    ]);
    search.mockResolvedValue({
      status: 'ok',
      hits: [hit(REVIEWED_CARD_ID, 0.9), hit(CARD_B, 0.9), hit(CARD_C, 0.9)],
    });

    const result = await service().findApplicable(request);

    expect(result.cards).toEqual([]);
    expect(result.trace).toMatchObject({ status: 'ok', candidates: 0 });
  });

  it('portão que falha não libera cartão nenhum', async () => {
    search.mockResolvedValue({ status: 'ok', hits: [hit(REVIEWED_CARD_ID, 0.9)] });
    const failing: CardRelevanceGate = {
      name: 'jev',
      judge: () => Promise.reject(new Error('timeout')),
    };

    const result = await service(failing).findApplicable(request);

    expect(result).toEqual({
      cards: [],
      trace: {
        status: 'gate_failed',
        gate: 'jev',
        fallback: null,
        candidates: 1,
        accepted: 0,
        rejected: {},
      },
    });
  });

  it('aceita outro portão pela interface (ponto de extensão da CC-407)', async () => {
    search.mockResolvedValue({
      status: 'ok',
      hits: [hit(REVIEWED_CARD_ID, 0.4), hit(CARD_B, 0.95)],
    });
    const calibrated: CardRelevanceGate = {
      name: 'jev',
      judge: async (candidates) => ({
        gate: 'jev',
        fallback: null,
        verdicts: candidates.map(({ card }) => ({
          cardId: card.cardId,
          applies: card.cardId === REVIEWED_CARD_ID,
          reason: card.cardId === REVIEWED_CARD_ID ? 'applies' : 'gate_rejected',
          score: card.cardId === REVIEWED_CARD_ID ? 0.93 : 0.04,
        })),
      }),
    };

    const result = await service(calibrated).findApplicable(request);

    expect(result.cards.map(({ card }) => card.cardId)).toEqual([REVIEWED_CARD_ID]);
    expect(result.trace).toMatchObject({ gate: 'jev', rejected: { gate_rejected: 1 } });
  });

  it('a trilha mostra quem decidiu e o fallback do portão configurado (CC-407)', async () => {
    search.mockResolvedValue({ status: 'ok', hits: [hit(REVIEWED_CARD_ID, 0.9)] });
    const fellBack: CardRelevanceGate = {
      name: 'jev',
      judge: async (candidates) => ({
        gate: 'similarity-theme',
        fallback: 'jev_failed',
        verdicts: candidates.map(({ card }) => ({
          cardId: card.cardId,
          applies: true,
          reason: 'applies',
          score: null,
        })),
      }),
    };

    const result = await service(fellBack).findApplicable(request);

    expect(result.cards).toHaveLength(1);
    expect(result.trace).toMatchObject({
      status: 'ok',
      gate: 'similarity-theme',
      fallback: 'jev_failed',
      accepted: 1,
    });
  });
});
