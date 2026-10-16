import { describe, expect, it } from 'vitest';
import { summarizeAnswers } from './shift-review.views';

describe('summarizeAnswers', () => {
  it('counts hits by confidence and ignores unanswered questions', () => {
    const summary = summarizeAnswers([
      { confidence: 'know', correct: true },
      { confidence: 'know', correct: false },
      { confidence: 'guessed', correct: true },
      { confidence: null, correct: null },
    ]);

    expect(summary).toEqual({
      total: 4,
      answered: 3,
      correct: 2,
      byConfidence: {
        know: { answered: 2, correct: 1 },
        unsure: { answered: 0, correct: 0 },
        guessed: { answered: 1, correct: 1 },
      },
    });
  });
});
