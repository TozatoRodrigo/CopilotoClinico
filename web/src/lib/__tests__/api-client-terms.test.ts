import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * CC-905 — 428 (`TERMS_ACCEPTANCE_REQUIRED`) de qualquer rota leva à tela de
 * aceite uma vez só, mesmo com várias consultas falhando juntas.
 */

function respond(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('apiClient on 428 (CC-905)', () => {
  let location: { pathname: string; origin: string; href: string };

  beforeEach(() => {
    vi.resetModules();
    location = { pathname: '/encounters', origin: 'http://localhost', href: '' };
    vi.stubGlobal('location', location);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the physician to the acceptance screen, keeping where they were', async () => {
    const fetchMock = vi.fn(() =>
      respond(428, { code: 'TERMS_ACCEPTANCE_REQUIRED', message: 'Aceite os termos.' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { apiClient, ApiError } = await import('../api-client');

    const first = apiClient.get('/encounters');
    await expect(first).rejects.toBeInstanceOf(ApiError);
    await expect(first).rejects.toMatchObject({ status: 428, message: 'Aceite os termos.' });
    expect(location.href).toBe('/aceite-termos?from=%2Fencounters');

    location.href = 'unchanged';
    await expect(apiClient.get('/dashboard/stats')).rejects.toMatchObject({ status: 428 });
    expect(location.href).toBe('unchanged');
  });

  it('does not redirect while already on the acceptance screen', async () => {
    location.pathname = '/aceite-termos';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(428, {})),
    );
    const { apiClient } = await import('../api-client');

    await expect(apiClient.get('/encounters')).rejects.toMatchObject({ status: 428 });
    expect(location.href).toBe('');
  });
});
