import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BetaRegistrationStatus } from '@contracts/beta';
import RegisterPage from '../page';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const pushMock = vi.fn();
const loginMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ login: loginMock }),
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => apiGetMock(...args),
      post: (...args: unknown[]) => apiPostMock(...args),
    },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ApiError } = await import('@/lib/api-client');

// O Select do Radix usa APIs de ponteiro e rolagem que o jsdom não tem.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function status(value: BetaRegistrationStatus) {
  apiGetMock.mockResolvedValue(value);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<RegisterPage />, { wrapper: Wrapper });
}

async function fillAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('E-mail'), 'dra.ana@example.com');
  await user.type(screen.getByLabelText('Senha'), 'Forte@123');
  await user.click(screen.getByRole('combobox', { name: 'UF do CRM' }));
  await user.click(await screen.findByRole('option', { name: 'MG' }));
  await user.type(screen.getByLabelText('Número do CRM'), '12345');
  await user.click(screen.getByRole('checkbox', { name: /Política de Privacidade/ }));
}

describe('Cadastro com o beta por convite (CC-702)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    apiPostMock.mockResolvedValue({ physician: { id: 'p-1', email: 'dra.ana@example.com' } });
  });

  it('keeps the open registration unchanged while the flag is off', async () => {
    status({ inviteRequired: false, invite: null });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Código de convite/)).not.toBeInTheDocument();

    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding'));
    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/register',
      expect.objectContaining({ email: 'dra.ana@example.com', inviteCode: undefined }),
    );
    expect(apiGetMock).toHaveBeenCalledWith('/beta/registration', undefined);
  });

  it('opens on the waitlist when the beta is closed and there is no invite', async () => {
    status({ inviteRequired: true, invite: null });
    apiPostMock.mockResolvedValue({ status: 'received' });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Beta só para convidados' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail'), 'dra.ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Entrar na lista de espera' }));
    // Sem o consentimento explícito, nada é enviado.
    expect(
      screen.getByText('Sem o seu consentimento não podemos avisar você.'),
    ).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /Autorizo a equipe/ }));
    await user.click(screen.getByRole('button', { name: 'Entrar na lista de espera' }));

    expect(
      await screen.findByRole('heading', { name: 'Você está na lista de espera' }),
    ).toBeInTheDocument();
    expect(apiPostMock).toHaveBeenCalledWith('/beta/waitlist', {
      email: 'dra.ana@example.com',
      contactConsent: true,
      profile: undefined,
    });
  });

  it('sends the optional profile with the waitlist request', async () => {
    status({ inviteRequired: true, invite: null });
    apiPostMock.mockResolvedValue({ status: 'received' });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('E-mail'), 'dra.ana@example.com');
    await user.click(screen.getByRole('button', { name: /Conte sobre o seu plantão/ }));
    await user.click(screen.getByRole('radio', { name: 'UPA 24h porte I' }));
    await user.click(screen.getByRole('radio', { name: 'Interior' }));
    await user.click(screen.getByRole('checkbox', { name: /Autorizo a equipe/ }));
    await user.click(screen.getByRole('button', { name: 'Entrar na lista de espera' }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith('/beta/waitlist', {
        email: 'dra.ana@example.com',
        contactConsent: true,
        profile: { facilityType: 'upa_porte_1', cityType: 'interior' },
      }),
    );
  });

  it('requires the code when the physician says they have an invite', async () => {
    status({ inviteRequired: true, invite: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Tenho um código de convite' }));
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();

    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));

    expect(screen.getByText('Informe o código de convite.')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('prefills a valid code from the invite link and goes to the beta onboarding', async () => {
    searchParams = new URLSearchParams('convite=k3mq9xpt');
    status({ inviteRequired: true, invite: { valid: true } });
    const user = userEvent.setup();
    renderPage();

    const field = await screen.findByLabelText('Código de convite');
    expect(field).toHaveValue('K3MQ-9XPT');
    expect(screen.getByText('Convite válido.')).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/beta/registration', { code: 'K3MQ9XPT' });

    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding/beta'));
    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/register',
      expect.objectContaining({ inviteCode: 'K3MQ9XPT' }),
    );
  });

  it('explains on arrival why the code in the link does not work', async () => {
    searchParams = new URLSearchParams('convite=K3MQ-9XPT');
    status({ inviteRequired: true, invite: { valid: false, reason: 'expired' } });
    renderPage();

    expect(
      await screen.findByText('Este convite venceu. Peça um novo a quem o enviou.'),
    ).toBeInTheDocument();
  });

  it('shows the API refusal of the code under the field', async () => {
    searchParams = new URLSearchParams('convite=K3MQ-9XPT');
    status({ inviteRequired: true, invite: { valid: true } });
    apiPostMock.mockRejectedValue(
      new ApiError(
        403,
        'Este convite já foi usado. Peça um novo a quem o enviou.',
        'BETA_INVITE_INVALID',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText('Código de convite');
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));

    expect(
      await screen.findByText('Este convite já foi usado. Peça um novo a quem o enviou.'),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('moves to the waitlist when the API says an invite is now required', async () => {
    status({ inviteRequired: false, invite: null });
    apiPostMock.mockRejectedValue(
      new ApiError(
        403,
        'O cadastro está aberto só para convidados do beta.',
        'BETA_INVITE_REQUIRED',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Crie sua conta' });
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));

    expect(
      await screen.findByRole('heading', { name: 'Beta só para convidados' }),
    ).toBeInTheDocument();
  });
});
