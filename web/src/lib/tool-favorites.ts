'use client';

import { useCallback, useState } from 'react';

/**
 * Favoritos das Ferramentas (ADR-017): ficam no aparelho, no máximo 15, sem
 * servidor — não há dado de paciente aqui, só ids de ferramenta. A chave é
 * `calc:<id>` para calculadora e `tool:<id>` para roteiro.
 */

export const MAX_FAVORITES = 15;
const STORAGE_KEY = 'copiloto:ferramentas:favoritos';

export type FavoriteKey = `calc:${string}` | `tool:${string}`;

export type FavoriteToggleOutcome = 'added' | 'removed' | 'limit-reached';

export function toggleFavorite(
  current: readonly FavoriteKey[],
  key: FavoriteKey,
  max = MAX_FAVORITES,
): { favorites: FavoriteKey[]; outcome: FavoriteToggleOutcome } {
  if (current.includes(key)) {
    return { favorites: current.filter((item) => item !== key), outcome: 'removed' };
  }
  if (current.length >= max) return { favorites: [...current], outcome: 'limit-reached' };
  return { favorites: [...current, key], outcome: 'added' };
}

function isFavoriteKey(value: unknown): value is FavoriteKey {
  return typeof value === 'string' && /^(calc|tool):[a-z0-9-]+$/.test(value);
}

/**
 * Lê o que estiver salvo sem confiar no formato: outro app, versão antiga ou
 * edição manual não podem quebrar o hub. Descarta o que não for chave
 * válida, repetições e o que passar do limite.
 */
export function parseStoredFavorites(raw: string | null, max = MAX_FAVORITES): FavoriteKey[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter(isFavoriteKey))].slice(0, max);
}

function readFavorites(): FavoriteKey[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseStoredFavorites(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeFavorites(favorites: readonly FavoriteKey[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    /* armazenamento indisponível (aba privada): favorito vale só nesta sessão */
  }
}

export function useToolFavorites() {
  // As páginas de (app) só montam no cliente, depois do login: ler o
  // localStorage no inicializador é seguro (mesmo padrão do AppShell).
  const [favorites, setFavorites] = useState<FavoriteKey[]>(readFavorites);

  const toggle = useCallback(
    (key: FavoriteKey): FavoriteToggleOutcome => {
      const next = toggleFavorite(favorites, key);
      if (next.outcome !== 'limit-reached') {
        setFavorites(next.favorites);
        writeFavorites(next.favorites);
      }
      return next.outcome;
    },
    [favorites],
  );

  const isFavorite = useCallback((key: FavoriteKey) => favorites.includes(key), [favorites]);

  return { favorites, toggle, isFavorite };
}
