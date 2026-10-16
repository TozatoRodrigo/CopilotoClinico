import { describe, expect, it } from 'vitest';
import { findPersonNames, NICKNAMES } from './person-names';
import { isProtectedClinicalTerm } from './protected-clinical-terms';

describe('NICKNAMES (CC-206)', () => {
  it('lists each nickname once, capitalized', () => {
    expect(new Set(NICKNAMES).size).toBe(NICKNAMES.length);
    for (const nickname of NICKNAMES) expect(nickname, nickname).toMatch(/^\p{Lu}\p{Ll}+$/u);
  });

  it('has no nickname that is also a protected clinical term', () => {
    const clashes = NICKNAMES.filter((nickname) =>
      isProtectedClinicalTerm(nickname, { start: 0, end: nickname.length }),
    );
    expect(clashes).toEqual([]);
  });
});

describe('findPersonNames', () => {
  it('returns each name once, without the honorific', () => {
    const text = 'Tião e a esposa, Sra. Maria das Dores, vizinhos do Seu Zé';
    expect(findPersonNames(text).map(({ start, end }) => text.slice(start, end))).toEqual([
      'Tião',
      'Maria das Dores',
      'Zé',
    ]);
  });

  it('finds nothing when the honorific is followed by a protected term only', () => {
    expect(findPersonNames('Seu Holter e seu Doppler vieram normais')).toEqual([]);
  });
});
