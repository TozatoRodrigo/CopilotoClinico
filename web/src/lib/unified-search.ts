'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  UNIFIED_SEARCH_DEFAULT_LIMIT,
  UNIFIED_SEARCH_MAX_CHARS,
  UNIFIED_SEARCH_MIN_CHARS,
} from '@/lib/search-contract';
import type { UnifiedSearchResponse } from '@/lib/types';

/**
 * CC-502 — busca única do ⌘K no servidor (cartões, protocolos e casos).
 * Ferramentas ficam fora: são locais e respondem a cada tecla.
 */

/** Pausa na digitação antes de ir ao servidor: uma busca por palavra, não por letra. */
export const UNIFIED_SEARCH_DEBOUNCE_MS = 250;

/** O valor depois de `delayMs` sem mudar. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** A busca que vai ao servidor: aparada e cortada no teto do contrato; curta demais não vai. */
export function serverSearchQuery(query: string): string | null {
  const trimmed = query.trim().slice(0, UNIFIED_SEARCH_MAX_CHARS).trim();
  return trimmed.length >= UNIFIED_SEARCH_MIN_CHARS ? trimmed : null;
}

export function fetchUnifiedSearch(q: string, signal?: AbortSignal) {
  return apiClient.get<UnifiedSearchResponse>(
    '/search',
    { q, limit: String(UNIFIED_SEARCH_DEFAULT_LIMIT) },
    { signal },
  );
}

/**
 * Consumir o `signal` faz o React Query cancelar a requisição da busca
 * anterior quando a digitação muda a chave: só a última chega à tela. Sem
 * conexão, nem tenta (o ⌘K avisa que esses grupos precisam de sinal).
 */
export function useUnifiedSearch(query: string | null, { online }: { online: boolean }) {
  return useQuery({
    queryKey: ['unified-search', query] as const,
    queryFn: ({ signal }) => fetchUnifiedSearch(query!, signal),
    enabled: online && query !== null,
    staleTime: 30_000,
    retry: false,
  });
}
