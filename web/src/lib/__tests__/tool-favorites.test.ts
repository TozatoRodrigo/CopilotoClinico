import { describe, expect, it } from 'vitest';
import {
  MAX_FAVORITES,
  parseStoredFavorites,
  toggleFavorite,
  type FavoriteKey,
} from '../tool-favorites';

describe('toggleFavorite', () => {
  it('inclui e tira', () => {
    const added = toggleFavorite([], 'calc:qsofa');
    expect(added).toEqual({ favorites: ['calc:qsofa'], outcome: 'added' });
    expect(toggleFavorite(added.favorites, 'calc:qsofa')).toEqual({
      favorites: [],
      outcome: 'removed',
    });
  });

  it(`para em ${MAX_FAVORITES} sem apagar nenhum`, () => {
    const full = Array.from(
      { length: MAX_FAVORITES },
      (_, index) => `calc:c${index}` as FavoriteKey,
    );
    const result = toggleFavorite(full, 'tool:acls');
    expect(result.outcome).toBe('limit-reached');
    expect(result.favorites).toEqual(full);
    // Tirar continua funcionando no limite.
    expect(toggleFavorite(full, 'calc:c0').outcome).toBe('removed');
  });
});

describe('parseStoredFavorites', () => {
  it('lê a lista salva', () => {
    expect(parseStoredFavorites('["calc:qsofa","tool:calculadoras"]')).toEqual([
      'calc:qsofa',
      'tool:calculadoras',
    ]);
  });

  it('não quebra com lixo, formato antigo ou repetição', () => {
    expect(parseStoredFavorites(null)).toEqual([]);
    expect(parseStoredFavorites('{')).toEqual([]);
    expect(parseStoredFavorites('{"a":1}')).toEqual([]);
    expect(parseStoredFavorites('["calc:qsofa", 3, "qsofa", "calc:QSOFA", "calc:qsofa"]')).toEqual([
      'calc:qsofa',
    ]);
  });

  it('corta no limite', () => {
    const many = JSON.stringify(Array.from({ length: 20 }, (_, index) => `calc:c${index}`));
    expect(parseStoredFavorites(many)).toHaveLength(MAX_FAVORITES);
  });
});
