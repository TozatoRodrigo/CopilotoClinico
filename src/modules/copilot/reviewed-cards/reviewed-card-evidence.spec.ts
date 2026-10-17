import { describe, expect, it } from 'vitest';
import {
  REVIEWED_CARD_ID,
  REVIEWED_VERSION_ID,
  REVIEWER_ID,
  reviewedCard,
} from '../../../../tests/fixtures/reviewed-cards';
import {
  buildReviewedCardsBlock,
  cardCitationId,
  cardPagePath,
  formatCardDose,
  isCardCitationId,
  reviewedByLine,
  toCardEvidence,
  toRecommendationReviewedCard,
  toReviewedCardRecord,
  unsupportedCardDoses,
} from './reviewed-card-evidence';

describe('cartão revisado como evidência (CC-408)', () => {
  it('numera os cartões como card:1, card:2… e os reconhece', () => {
    const evidence = toCardEvidence([
      { card: reviewedCard(), similarity: 0.8 },
      { card: reviewedCard({ cardId: 'outro' }), similarity: 0.7 },
    ]);

    expect(evidence.map((item) => item.citationId)).toEqual(['card:1', 'card:2']);
    expect(cardCitationId(3)).toBe('card:3');
    expect(isCardCitationId('card:1')).toBe(true);
    expect(isCardCitationId('web:1')).toBe(false);
  });

  it('escreve o "Revisado por" com nome, CRM e a data de Brasília', () => {
    expect(reviewedByLine(reviewedCard())).toBe(
      'Revisado por Dr(a). Ana Souza, CRM 123456/SP, em 12/10/2026',
    );
    // 01:30 UTC ainda é dia 11 em Brasília.
    expect(
      reviewedByLine(
        reviewedCard({
          reviewer: { ...reviewedCard().reviewer, name: null },
          reviewedAt: '2026-10-12T01:30:00.000Z',
        }),
      ),
    ).toBe('Revisado por CRM 123456/SP, em 11/10/2026');
  });

  it('escreve a dose estruturada inteira, sem campo vazio', () => {
    const dose = reviewedCard().content.claims[0]!.dose!;

    expect(formatCardDose(dose)).toBe(
      'Ceftriaxona 2 g · intravenosa · a cada 12 horas · máximo 4 g/dia',
    );
    expect(formatCardDose({ ...dose, route: null, frequency: null, maxDose: null })).toBe(
      'Ceftriaxona 2 g',
    );
  });

  it('sem cartão, o bloco não existe', () => {
    expect(buildReviewedCardsBlock([])).toBe('');
  });

  describe('unsupportedCardDoses — só a dose estruturada do cartão, do mesmo fármaco, é liberada', () => {
    const card = reviewedCard();

    it('libera a dose e o teto do cartão, com ou sem espaço', () => {
      expect(
        unsupportedCardDoses(
          'Ceftriaxona 2 g IV a cada 12 horas (máximo 4 g/dia) Iniciar logo após o líquor',
          card,
        ),
      ).toEqual([]);
      expect(unsupportedCardDoses('Ceftriaxona 2g IV de 12/12 h', card)).toEqual([]);
    });

    it('sem dose no texto, nada a conferir', () => {
      expect(unsupportedCardDoses('Iniciar ceftriaxona sem aguardar o líquor', card)).toEqual([]);
    });

    it('recusa dose que o cartão não dá', () => {
      expect(unsupportedCardDoses('Ceftriaxona 1 g IV a cada 12 horas', card)).toEqual(['1 g']);
    });

    it('recusa a dose do cartão escrita para outro fármaco', () => {
      expect(unsupportedCardDoses('Cefotaxima 2 g IV a cada 6 horas', card)).toEqual(['2 g']);
    });

    it('recusa dose que só aparece no texto livre do cartão, sem dose estruturada', () => {
      const withoutStructuredDose = reviewedCard();
      withoutStructuredDose.content = {
        ...withoutStructuredDose.content,
        claims: withoutStructuredDose.content.claims.map((claim) => ({ ...claim, dose: null })),
      };

      expect(
        unsupportedCardDoses('Ceftriaxona 2 g IV a cada 12 horas', withoutStructuredDose),
      ).toEqual(['2 g']);
    });

    it('casa o fármaco sem o que vem entre parênteses e exige todas as palavras do nome', () => {
      const adrenaline = reviewedCard();
      const claim = adrenaline.content.claims[0]!;
      adrenaline.content = {
        ...adrenaline.content,
        claims: [
          {
            ...claim,
            dose: {
              ...claim.dose!,
              drug: 'Sulfato de magnésio (MgSO4)',
              amount: '2 g',
              maxDose: null,
            },
          },
        ],
      };

      expect(unsupportedCardDoses('Sulfato de magnésio 2 g IV em 20 min', adrenaline)).toEqual([]);
      expect(unsupportedCardDoses('Sulfato ferroso 2 g', adrenaline)).toEqual(['2 g']);
    });
  });

  it('mostra na tela quem assinou, sem o id interno do revisor', () => {
    expect(toRecommendationReviewedCard(reviewedCard())).toEqual({
      cardId: REVIEWED_CARD_ID,
      version: 2,
      question: 'Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?',
      reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
      reviewedAt: '2026-10-12T15:00:00.000Z',
      validUntil: '2027-10-12T15:00:00.000Z',
    });
  });

  it('grava na trilha a versão, o hash assinado e o revisor, sem texto do cartão', () => {
    const [evidence] = toCardEvidence([{ card: reviewedCard(), similarity: 0.8 }]);

    expect(toReviewedCardRecord(evidence!)).toEqual({
      citationId: 'card:1',
      cardId: REVIEWED_CARD_ID,
      versionId: REVIEWED_VERSION_ID,
      version: 2,
      contentSha256: reviewedCard().contentSha256,
      reviewerId: REVIEWER_ID,
      similarity: 0.8,
    });
    expect(cardPagePath(REVIEWED_CARD_ID)).toBe(`/cartoes/${REVIEWED_CARD_ID}`);
  });
});
