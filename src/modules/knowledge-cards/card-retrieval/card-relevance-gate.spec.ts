import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { reviewedCard } from '../../../../tests/fixtures/reviewed-cards';
import {
  judgeBySimilarityAndTheme,
  SimilarityThemeGate,
  topicMatchesCase,
  type CardRelevanceContext,
} from './card-relevance-gate';
import {
  DEFAULT_REVIEWED_CARDS_MAX,
  DEFAULT_REVIEWED_CARDS_MIN_SIMILARITY,
  readReviewedCardsSettings,
} from './reviewed-cards.settings';

const meningitisCase: CardRelevanceContext = {
  syndrome: 'febre',
  hypotheses: ['Meningite bacteriana', 'Hemorragia subaracnóidea'],
  problemRepresentation: 'Adulto com febre, cefaleia e rigidez de nuca há 12 horas',
};

describe('portão de relevância por similaridade e tema (CC-408)', () => {
  it('aplica o cartão parecido e da mesma síndrome', () => {
    expect(
      judgeBySimilarityAndTheme({ card: reviewedCard(), similarity: 0.7 }, meningitisCase, 0.5),
    ).toEqual({ cardId: reviewedCard().cardId, applies: true, reason: 'applies', score: null });
  });

  it('recusa o cartão abaixo da similaridade mínima', () => {
    expect(
      judgeBySimilarityAndTheme({ card: reviewedCard(), similarity: 0.49 }, meningitisCase, 0.5),
    ).toMatchObject({ applies: false, reason: 'below_similarity' });
  });

  it('recusa o cartão de outra síndrome, mesmo muito parecido', () => {
    expect(
      judgeBySimilarityAndTheme(
        { card: reviewedCard({ syndrome: 'dor-toracica' }), similarity: 0.95 },
        meningitisCase,
        0.5,
      ),
    ).toMatchObject({ applies: false, reason: 'syndrome_mismatch' });
  });

  it('sem síndrome definida de um dos lados, decide pelo tema', () => {
    const genericCard = reviewedCard({ syndrome: null });
    expect(
      judgeBySimilarityAndTheme({ card: genericCard, similarity: 0.7 }, meningitisCase, 0.5),
    ).toMatchObject({ applies: true });

    const otherCase = { ...meningitisCase, syndrome: 'outro' as const };
    expect(
      judgeBySimilarityAndTheme({ card: reviewedCard(), similarity: 0.7 }, otherCase, 0.5),
    ).toMatchObject({ applies: true });

    expect(
      judgeBySimilarityAndTheme(
        { card: reviewedCard({ syndrome: null, topic: 'Escorpionismo' }), similarity: 0.7 },
        meningitisCase,
        0.5,
      ),
    ).toMatchObject({ applies: false, reason: 'topic_mismatch' });
  });

  it('o tema casa pelas hipóteses ou pelo entendimento, sem acento e sem caixa', () => {
    expect(
      topicMatchesCase('Meningite bacteriana: antibiótico empírico no adulto', meningitisCase),
    ).toBe(true);
    expect(
      topicMatchesCase('Anafilaxia', {
        syndrome: null,
        hypotheses: ['Anafilaxia grave com hipotensão'],
        problemRepresentation: null,
      }),
    ).toBe(true);
    expect(topicMatchesCase('Dengue com sinais de alarme', meningitisCase)).toBe(false);
    expect(topicMatchesCase('de do', meningitisCase)).toBe(false);
  });

  it('o portão injetável lê o limiar do ambiente a cada julgamento', async () => {
    const gate = new SimilarityThemeGate(
      new ConfigService({ REVIEWED_CARDS_MIN_SIMILARITY: '0.8' }),
    );

    const verdicts = await gate.judge(
      [
        { card: reviewedCard(), similarity: 0.75 },
        { card: reviewedCard({ cardId: 'b' }), similarity: 0.85 },
      ],
      meningitisCase,
    );

    expect(gate.name).toBe('similarity-theme');
    expect(verdicts.map((verdict) => verdict.applies)).toEqual([false, true]);
  });
});

describe('readReviewedCardsSettings', () => {
  it('usa os padrões sem valor ou com valor inválido — um typo nunca afrouxa o portão', () => {
    const defaults = {
      minSimilarity: DEFAULT_REVIEWED_CARDS_MIN_SIMILARITY,
      maxCards: DEFAULT_REVIEWED_CARDS_MAX,
    };
    expect(readReviewedCardsSettings(new ConfigService({}))).toEqual(defaults);
    for (const [similarity, max] of [
      ['abc', 'x'],
      ['0', '0'],
      ['1.5', '2.5'],
      ['', '9'],
    ]) {
      expect(
        readReviewedCardsSettings(
          new ConfigService({ REVIEWED_CARDS_MIN_SIMILARITY: similarity, REVIEWED_CARDS_MAX: max }),
        ),
      ).toEqual(defaults);
    }
  });

  it('aceita valores dentro da faixa', () => {
    expect(
      readReviewedCardsSettings(
        new ConfigService({ REVIEWED_CARDS_MIN_SIMILARITY: '0.62', REVIEWED_CARDS_MAX: 2 }),
      ),
    ).toEqual({ minSimilarity: 0.62, maxCards: 2 });
  });
});
