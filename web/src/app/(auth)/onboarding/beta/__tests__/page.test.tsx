import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BETA_TERMS, type BetaMe } from '@contracts/beta';
import BetaOnboardingPage from '../page';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiPutMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({
    physician: { id: 'p-1', crmUf: 'MG', crmNumber: '12345', crmVerified: false },
  }),
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      post: (...args: unknown[]) => apiPostMock(...args),
      put: (...args: unknown[]) => apiPutMock(...args),
    },
  };
});

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.scrollTo = vi.fn();
});

const profile = {
  training: 'recem_formado',
  facilityType: 'upa_porte_1',
  uf: 'MG',
  cityType: 'interior',
} as const;

function me(overrides: { accepted?: boolean; withProfile?: boolean } = {}): BetaMe {
  const accepted = overrides.accepted ?? false;
  const withProfile = overrides.withProfile ?? false;
  return {
    participant: true,
    joinedAt: '2026-10-15T10:00:00.000Z',
    terms: {
      currentVersion: BETA_TERMS.version,
      acceptedVersion: accepted ? BETA_TERMS.version : null,
      acceptedAt: accepted ? '2026-10-15T10:01:00.000Z' : null,
      upToDate: accepted,
    },
    profile: withProfile ? profile : null,
    needsOnboarding: !(accepted && withProfile),
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<BetaOnboardingPage />, { wrapper: Wrapper });
}

describe('Onboarding do beta (CC-702)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends an account without invite back to the dashboard', async () => {
    apiGetMock.mockResolvedValue({ participant: false });
    renderPage();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('goes from the terms to the profile to the first guided case', async () => {
    apiGetMock.mockResolvedValue(me());
    apiPostMock.mockImplementation((path: string) =>
      Promise.resolve(path === '/encounters' ? { id: 'enc-1' } : me({ accepted: true })),
    );
    apiPutMock.mockResolvedValue(me({ accepted: true, withProfile: true }));
    const user = userEvent.setup();
    renderPage();

    // 1. Termo do beta, marcado como provisório.
    expect(await screen.findByRole('heading', { name: 'Bem-vindo ao beta' })).toBeInTheDocument();
    expect(screen.getByText('Texto provisório')).toBeInTheDocument();
    expect(screen.getByText(`Versão ${BETA_TERMS.version}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));
    expect(screen.getByText('Para participar do beta, aceite o termo.')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));
    expect(apiPostMock).toHaveBeenCalledWith('/beta/me/terms', { version: BETA_TERMS.version });

    // 2. Perfil do plantão; o CRM já veio do cadastro.
    expect(await screen.findByRole('heading', { name: 'Seu plantão' })).toBeInTheDocument();
    expect(screen.getByText('MG 12345')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect(screen.getByText('Escolha a sua formação.')).toBeInTheDocument();
    expect(apiPutMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('radio', { name: 'Formado há menos de 2 anos, sem residência' }),
    );
    await user.click(screen.getByRole('radio', { name: 'UPA 24h porte I' }));
    await user.click(screen.getByRole('combobox', { name: 'UF do plantão' }));
    await user.click(await screen.findByRole('option', { name: 'MG' }));
    await user.click(screen.getByRole('radio', { name: 'Interior' }));
    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect(apiPutMock).toHaveBeenCalledWith('/beta/me/profile', profile);

    // 3. Primeiro caso guiado: o caso de exemplo abre direto na conversa.
    expect(await screen.findByRole('heading', { name: 'Seu primeiro caso' })).toBeInTheDocument();
    expect(screen.getByText('Síndrome gripal >48h')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir o caso de exemplo' }));
    expect(apiPostMock).toHaveBeenCalledWith('/encounters', {
      patientRef: 'Demo-Gripal-48h',
      vertical: 'general',
      context: { hasCT: false, isSus: true, hasLab: true, hasICU: false },
    });
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        '/encounters/enc-1/conversation?demoCase=sindrome-gripal',
      ),
    );
  });

  it('resumes at the first case when terms and profile are done', async () => {
    apiGetMock.mockResolvedValue(me({ accepted: true, withProfile: true }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Seu primeiro caso' })).toBeInTheDocument();
  });

  it('asks only for the new terms when the version changed', async () => {
    apiGetMock.mockResolvedValue({
      ...me({ withProfile: true }),
      terms: {
        currentVersion: BETA_TERMS.version,
        acceptedVersion: '2026-09-01-provisorio',
        acceptedAt: '2026-09-01T10:00:00.000Z',
        upToDate: false,
      },
    });
    apiPostMock.mockResolvedValue(me({ accepted: true, withProfile: true }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: /Li e aceito/ }));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));

    expect(await screen.findByRole('heading', { name: 'Seu primeiro caso' })).toBeInTheDocument();
  });

  it('shows the conflict message when the terms changed while reading', async () => {
    const { ApiError } = await import('@/lib/api-client');
    apiGetMock.mockResolvedValue(me());
    apiPostMock.mockRejectedValue(
      new ApiError(
        409,
        'O termo do beta mudou. Recarregue a página e leia a versão nova antes de aceitar.',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: /Li e aceito/ }));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));

    expect(await screen.findByText(/O termo do beta mudou/)).toBeInTheDocument();
  });
});
