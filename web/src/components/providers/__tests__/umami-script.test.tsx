import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UMAMI_DISABLED_KEY } from '@/lib/analytics-consent';
import { UmamiScript } from '../umami-script';

const auth = vi.hoisted(() => ({
  physician: null as { id: string } | null,
  isLoading: false,
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => auth,
}));

// O next/script injeta a tag fora da árvore; aqui basta saber se foi pedido.
vi.mock('next/script', () => ({
  default: (props: ComponentProps<'script'>) => (
    <span data-testid="umami-script" data-src={props.src} />
  ),
}));

const fetchMock = vi.fn();

function consentResponse(revokedAt: string | null, granted = false): Response {
  return new Response(
    JSON.stringify([
      { scope: 'ai_processing', granted: true, grantedAt: null, revokedAt: null },
      { scope: 'analytics', granted, grantedAt: null, revokedAt },
    ]),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function renderScript() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UmamiScript src="https://analytics.example/script.js" websiteId="site-1" />
    </QueryClientProvider>,
  );
}

// CC-014 — o Umami não carrega (nem manda eventos) para o médico que revogou
// "Analytics"; sem revogação, conta como sempre contou.
describe('UmamiScript', () => {
  beforeEach(() => {
    auth.physician = null;
    auth.isLoading = false;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads for a visitor without login, without asking the API', () => {
    renderScript();

    expect(screen.getByTestId('umami-script')).toHaveAttribute(
      'data-src',
      'https://analytics.example/script.js',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not load for a physician who revoked analytics, and opts the browser out', async () => {
    auth.physician = { id: 'p1' };
    fetchMock.mockResolvedValue(consentResponse('2026-10-15T12:00:00.000Z'));

    renderScript();

    await waitFor(() => expect(window.localStorage.getItem(UMAMI_DISABLED_KEY)).toBe('1'));
    expect(screen.queryByTestId('umami-script')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/lgpd\/consent$/), {
      credentials: 'include',
    });
  });

  it('loads for a physician who never revoked, and clears an old opt-out', async () => {
    auth.physician = { id: 'p2' };
    window.localStorage.setItem(UMAMI_DISABLED_KEY, '1');
    fetchMock.mockResolvedValue(consentResponse(null));

    renderScript();

    expect(await screen.findByTestId('umami-script')).toBeInTheDocument();
    expect(window.localStorage.getItem(UMAMI_DISABLED_KEY)).toBeNull();
  });

  it('waits for the consent before loading', () => {
    auth.physician = { id: 'p3' };
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderScript();

    expect(screen.queryByTestId('umami-script')).toBeNull();
  });

  it('keeps a visitor out on a browser where the last physician revoked', () => {
    window.localStorage.setItem(UMAMI_DISABLED_KEY, '1');

    renderScript();

    expect(screen.queryByTestId('umami-script')).toBeNull();
  });

  it('falls back to what the browser remembers when the API fails', async () => {
    auth.physician = { id: 'p4' };
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    renderScript();

    // Sem resposta, vale o navegador, que não ficou de fora: carrega. O 401
    // não passa pelo apiClient, então não leva ninguém ao login.
    expect(await screen.findByTestId('umami-script')).toBeInTheDocument();
    expect(window.localStorage.getItem(UMAMI_DISABLED_KEY)).toBeNull();
  });
});
