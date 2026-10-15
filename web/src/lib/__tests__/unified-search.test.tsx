import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { serverSearchQuery, useDebouncedValue, useUnifiedSearch } from '../unified-search';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const EMPTY = {
  cards: { status: 'ok', items: [] },
  protocols: { status: 'ok', items: [] },
  cases: { status: 'ok', items: [] },
};

describe('busca única no servidor (CC-502)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('serverSearchQuery apara, corta no teto do contrato e não manda busca curta', () => {
    expect(serverSearchQuery('  nora  ')).toBe('nora');
    expect(serverSearchQuery(' n ')).toBeNull();
    expect(serverSearchQuery('a'.repeat(150))).toHaveLength(100);
  });

  it('useDebouncedValue só muda depois da pausa', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'no' },
    });

    rerender({ value: 'nor' });
    rerender({ value: 'nora' });
    expect(result.current).toBe('no');

    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe('nora');
  });

  it('busca em GET /search com a busca e o limite, e cancela a anterior quando a busca muda', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal!);
      // A primeira nunca responde: só termina se for cancelada.
      if (signals.length === 1) return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify(EMPTY), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => useUnifiedSearch(query, { online: true }),
      { wrapper: wrapper(), initialProps: { query: 'nora' as string | null } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.pathname).toBe('/v1/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'nora', limit: '5' });

    rerender({ query: 'noradrenalina' });

    await waitFor(() => expect(result.current.data).toEqual(EMPTY));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it('sem conexão ou sem busca, não chama o servidor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useUnifiedSearch('nora', { online: false }), { wrapper: wrapper() });
    renderHook(() => useUnifiedSearch(null, { online: true }), { wrapper: wrapper() });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
