import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { isReviewedCardsEnabled } from './reviewed-cards.settings';

describe('COPILOT_REVIEWED_CARDS (CC-408)', () => {
  it('fica desligada sem valor ou com valor irreconhecível', () => {
    expect(isReviewedCardsEnabled(new ConfigService({}))).toBe(false);
    expect(isReviewedCardsEnabled(new ConfigService({ COPILOT_REVIEWED_CARDS: 'talvez' }))).toBe(
      false,
    );
  });

  it('liga com os valores de sempre', () => {
    for (const value of ['on', 'true', '1', 'yes']) {
      expect(isReviewedCardsEnabled(new ConfigService({ COPILOT_REVIEWED_CARDS: value }))).toBe(
        true,
      );
    }
  });
});
