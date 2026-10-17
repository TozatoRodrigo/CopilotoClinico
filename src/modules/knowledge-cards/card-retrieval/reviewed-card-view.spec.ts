import { describe, expect, it } from 'vitest';
import {
  REVIEWED_CARD_ID,
  reviewedCard,
  reviewedCardRow,
} from '../../../../tests/fixtures/reviewed-cards';
import { toPublishedCard, toReviewedCard, type ReviewedCardRow } from './reviewed-card-view';

const card = reviewedCard();

function withVersion(overrides: Partial<NonNullable<ReviewedCardRow['publishedVersion']>>) {
  return reviewedCardRow({
    publishedVersion: { ...reviewedCardRow().publishedVersion!, ...overrides },
  });
}

describe('toReviewedCard (CC-408)', () => {
  it('monta o cartão revisado da versão publicada', () => {
    expect(toReviewedCard(reviewedCardRow())).toEqual(card);
  });

  it.each([
    ['arquivado', reviewedCardRow({ status: 'archived' })],
    ['sem versão publicada', reviewedCardRow({ publishedVersion: null })],
    ['versão não aprovada', withVersion({ reviewDecision: null })],
    ['sem validade', withVersion({ validUntil: null })],
    ['sem data de revisão', withVersion({ reviewedAt: null })],
    [
      'revisor sem CRM verificado',
      withVersion({ reviewer: { ...card.reviewer, crmVerified: false } }),
    ],
    ['conteúdo inválido', withVersion({ content: { question: 'x' } })],
  ])('não vale como fonte revisada: %s', (_reason, row) => {
    expect(toReviewedCard(row)).toBeNull();
  });

  it('síndrome desconhecida vira null', () => {
    expect(toReviewedCard(reviewedCardRow({ syndrome: 'inventada' }))?.syndrome).toBeNull();
  });
});

describe('toPublishedCard (CC-408)', () => {
  it('mostra o revisor sem id interno e "revisar" quando a validade passou', () => {
    const published = toPublishedCard(card, new Date('2026-10-15T00:00:00.000Z'));
    expect(published).toMatchObject({
      id: REVIEWED_CARD_ID,
      displayStatus: 'published',
      version: 2,
      reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
    });
    expect(published.reviewer).not.toHaveProperty('id');

    expect(toPublishedCard(card, new Date('2028-01-01T00:00:00.000Z')).displayStatus).toBe(
      'needs_review',
    );
  });
});
