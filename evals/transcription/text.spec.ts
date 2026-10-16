import { describe, expect, it } from 'vitest';
import { charErrors, editCounts, errorRate, normalizeForWer, sumErrors, wordErrors } from './text';

const IGNORE = { ignoreAccents: true };
const KEEP = { ignoreAccents: false };

describe('normalizeForWer', () => {
  it('drops case and punctuation but keeps decimal separators inside numbers', () => {
    expect(normalizeForWer('Dor, febre. PA 120/80; 0,5 mg — 1.000 UI!', IGNORE)).toBe(
      'dor febre pa 120 80 0,5 mg 1.000 ui',
    );
  });

  it('drops accents only when asked', () => {
    expect(normalizeForWer('Hipotensão e sódio', IGNORE)).toBe('hipotensao e sodio');
    expect(normalizeForWer('Hipotensão e sódio', KEEP)).toBe('hipotensão e sódio');
  });
});

describe('editCounts', () => {
  it('counts substitutions, deletions and insertions', () => {
    expect(editCounts(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])).toEqual({
      substitutions: 1,
      deletions: 0,
      insertions: 1,
    });
    expect(editCounts(['a', 'b', 'c'], ['a', 'c'])).toEqual({
      substitutions: 0,
      deletions: 1,
      insertions: 0,
    });
  });

  it('handles empty sides', () => {
    expect(editCounts([], ['a', 'b'])).toEqual({ substitutions: 0, deletions: 0, insertions: 2 });
    expect(editCounts(['a', 'b'], [])).toEqual({ substitutions: 0, deletions: 2, insertions: 0 });
  });
});

describe('wordErrors / charErrors', () => {
  it('is zero when only case, punctuation and accents differ', () => {
    const result = wordErrors('Paciente com hipotensão.', 'paciente com hipotensao', IGNORE);
    expect(result.errors).toBe(0);
    expect(errorRate(result)).toBe(0);
  });

  it('counts a missing accent as a word error when accents are kept', () => {
    const result = wordErrors('Paciente com hipotensão', 'paciente com hipotensao', KEEP);
    expect(result).toMatchObject({ substitutions: 1, errors: 1, referenceLength: 3 });
    expect(errorRate(result)).toBeCloseTo(1 / 3);
  });

  it('measures WER over reference words and CER over characters, spaces included', () => {
    const words = wordErrors('dobutamina cinco mcg', 'dopamina cinco mcg', IGNORE);
    expect(words).toMatchObject({ errors: 1, referenceLength: 3 });

    const chars = charErrors('dobutamina', 'dopamina', IGNORE);
    expect(chars).toMatchObject({ errors: 3, referenceLength: 10 });

    const glued = charErrors('PA 120', 'pa120', IGNORE);
    expect(glued).toMatchObject({ deletions: 1, errors: 1, referenceLength: 6 });
  });

  it('can pass 100% when the transcript invents words', () => {
    const result = wordErrors('ok', 'ok mais duas palavras', IGNORE);
    expect(errorRate(result)).toBe(3);
  });

  it('has no rate without a reference', () => {
    expect(errorRate(wordErrors('', 'algo', IGNORE))).toBeNull();
  });
});

describe('sumErrors', () => {
  it('weighs each file by its length (corpus rate, not mean of rates)', () => {
    const short = wordErrors('a b', 'a x', IGNORE); // 1/2
    const long = wordErrors('a b c d e f g h', 'a b c d e f g h', IGNORE); // 0/8

    const total = sumErrors([short, long]);

    expect(total).toMatchObject({ errors: 1, referenceLength: 10, substitutions: 1 });
    expect(errorRate(total)).toBeCloseTo(0.1);
  });
});
