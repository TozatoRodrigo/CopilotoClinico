import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeFavoritesToken,
  encodeFavoritesToken,
  FAVORITES_TOKEN_V1_KEYS,
  mapAnyFavorite,
  mapAnyFavorites,
  MAX_TOOL_FAVORITES,
  mergeMigratedFavorites,
  type ToolFavoriteKey,
} from './any-favorites';
import { COPILOTO_CALCULATORS } from './copiloto-tools-snapshot';

describe('CC-335 — favoritos do ANY', () => {
  it('toda calculadora do ANY tem equivalente, inclusive as com acento', () => {
    for (const { id, anyId } of COPILOTO_CALCULATORS) {
      expect(mapAnyFavorite(anyId)).toBe(`calc:${id}`);
      // O mesmo id vindo decomposto (NFD) de outra fonte.
      expect(mapAnyFavorite(anyId.normalize('NFD'))).toBe(`calc:${id}`);
    }
    expect(mapAnyFavorite('fórmula-winters')).toBe('calc:formula-winters');
  });

  it('os roteiros do hub do ANY saem do mesmo mapa dos redirecionamentos', () => {
    expect(mapAnyFavorite('acls')).toBe('tool:acls');
    expect(mapAnyFavorite('keto')).toBe('tool:cad-ehh');
    expect(mapAnyFavorite('shock')).toBe('tool:choque-septico');
    expect(mapAnyFavorite('infusion')).toBe('tool:infusoes');
    expect(mapAnyFavorite('calculadoras')).toBe('tool:calculadoras');
    expect(mapAnyFavorite('login')).toBeNull();
    expect(mapAnyFavorite('hetrinped')).toBeNull();
    expect(mapAnyFavorite('xpto')).toBeNull();
  });

  it('nenhuma chave de roteiro do ANY é também id de calculadora', () => {
    const calculatorIds = new Set<string>(COPILOTO_CALCULATORS.map(({ anyId }) => anyId));
    for (const key of ['acls', 'keto', 'shock', 'infusion', 'calculadoras', 'tox', 'ped']) {
      expect(calculatorIds.has(key)).toBe(false);
    }
  });

  it('traduz uma lista sem repetir e conta o que não tem equivalente', () => {
    expect(mapAnyFavorites(['gcs', 'xpto', 'gcs', ' ', 'critérios-light'])).toEqual({
      keys: ['calc:gcs', 'calc:criterios-light'],
      unknown: 1,
    });
  });

  describe('parâmetro opaco', () => {
    it('ida e volta, na ordem do catálogo', () => {
      const keys: ToolFavoriteKey[] = ['calc:vti-classificacao', 'tool:acls', 'calc:heart-score'];
      const token = encodeFavoritesToken(keys);
      expect(decodeFavoritesToken(token)).toEqual([
        'tool:acls',
        'calc:heart-score',
        'calc:vti-classificacao',
      ]);
    });

    it('todas as chaves cabem num parâmetro curto e seguro para URL', () => {
      const token = encodeFavoritesToken(FAVORITES_TOKEN_V1_KEYS) ?? '';
      expect(token).toMatch(/^1[A-Za-z0-9_-]{16}$/);
      expect(decodeFavoritesToken(token)).toEqual(FAVORITES_TOKEN_V1_KEYS);
    });

    it('não mostra id de ferramenta em claro', () => {
      const token = encodeFavoritesToken(['calc:heart-score', 'tool:acls']) ?? '';
      expect(token).not.toMatch(/heart|acls|calc|tool/);
    });

    it('sem favoritos, o link sai sem o parâmetro', () => {
      expect(encodeFavoritesToken([])).toBeNull();
    });

    it('parâmetro editado à mão ou de outra versão vira lista vazia', () => {
      for (const bad of [null, undefined, '', '1', '1!!!!', '2AAAAAAAAAAAAAAAA', '1AAAA', 'xyz']) {
        expect(decodeFavoritesToken(bad)).toEqual([]);
      }
    });

    it('a ordem da versão 1 é congelada (links já enviados abrem igual)', () => {
      expect(FAVORITES_TOKEN_V1_KEYS).toHaveLength(90);
      expect(createHash('sha256').update(FAVORITES_TOKEN_V1_KEYS.join('\n')).digest('hex')).toBe(
        '768acdc55d6851d82a36279d1e1197cfddc2c043926842a651cdda5a4d8932fd',
      );
    });
  });

  it('junta aos favoritos do aparelho sem repetir e até o limite', () => {
    expect(mergeMigratedFavorites(['tool:acls'], ['calc:gcs', 'tool:acls'])).toEqual([
      'tool:acls',
      'calc:gcs',
    ]);
    const many = FAVORITES_TOKEN_V1_KEYS.slice(0, 20);
    const merged = mergeMigratedFavorites(['calc:gcs'], many);
    expect(merged).toHaveLength(MAX_TOOL_FAVORITES);
    expect(merged[0]).toBe('calc:gcs');
  });
});
