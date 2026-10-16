import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OAuthLanding } from '../_components/oauth-landing';
import { parseOAuthLandingParams } from '../_components/oauth-landing-params';
import type { Physician } from '@/lib/types';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const replaceMock = vi.fn();
const loginMock = vi.fn();
const toastSuccessMock = vi.fn();

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ login: loginMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args), error: vi.fn() },
}));

// O Select do Radix não abre no jsdom; um <select> nativo basta para o fluxo.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select aria-label="UF do CRM" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">UF</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const { ApiError } = await import('@/lib/api-client');

const PHYSICIAN: Physician = {
  id: 'p-1',
  name: 'Dra. Ana Souza',
  email: 'medica@example.com',
  crmUf: 'RJ',
  crmNumber: '52123',
  crmVerified: false,
  role: 'PHYSICIAN',
  hasPassword: false,
};

function renderLanding(props: Parameters<typeof OAuthLanding>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OAuthLanding {...props} />
    </QueryClientProvider>,
  );
}

describe('parseOAuthLandingParams', () => {
  it('keeps known values and turns anything else into a generic error', () => {
    expect(parseOAuthLandingParams({ status: 'signup' })).toEqual({
      status: 'signup',
      reason: null,
    });
    expect(parseOAuthLandingParams({ status: 'error', reason: 'email_unverified' })).toEqual({
      status: 'error',
      reason: 'email_unverified',
    });
    expect(parseOAuthLandingParams({ status: 'error', reason: '<script>' })).toEqual({
      status: 'error',
      reason: 'provider_error',
    });
    expect(parseOAuthLandingParams({ status: 'toString' })).toEqual({
      status: 'error',
      reason: 'provider_error',
    });
  });
});

describe('OAuthLanding (CC-334)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains why the login failed, without calling the API', () => {
    renderLanding({ status: 'error', reason: 'email_unverified' });

    expect(screen.getByRole('heading', { name: 'Não foi possível entrar' })).toBeInTheDocument();
    expect(screen.getByText(/não confirmou o seu e-mail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao login' })).toHaveAttribute('href', '/login');
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('loads the physician and goes to the dashboard when the session is open', async () => {
    apiGetMock.mockResolvedValue(PHYSICIAN);

    renderLanding({ status: 'ok', reason: null });

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(apiGetMock).toHaveBeenCalledWith('/auth/me');
    expect(loginMock).toHaveBeenCalledWith(PHYSICIAN);
  });

  it('says the step expired when there is nothing pending', async () => {
    apiGetMock.mockResolvedValue({ kind: 'none' });

    renderLanding({ status: 'signup', reason: null });

    expect(await screen.findByText(/expirou/)).toBeInTheDocument();
  });

  it('new account: asks for the CRM and goes to onboarding', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValue({
      kind: 'signup',
      provider: 'google',
      email: 'medica@example.com',
      name: 'Dra. Ana Souza',
    });
    apiPostMock.mockResolvedValue({ physician: PHYSICIAN });

    renderLanding({ status: 'signup', reason: null });

    expect(
      await screen.findByRole('heading', { name: 'Complete seu cadastro' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('medica@example.com');
    expect(screen.getByLabelText('Nome (opcional)')).toHaveValue('Dra. Ana Souza');

    // Sem CRM e sem aceite, não envia.
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(screen.getByText('UF obrigatória. Número obrigatório.')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'UF do CRM' }), 'RJ');
    await user.type(screen.getByLabelText('Número do CRM'), '52123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Criar conta com CRM' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/onboarding'));
    expect(apiPostMock).toHaveBeenCalledWith('/auth/oauth/signup', {
      crmUf: 'RJ',
      crmNumber: '52123',
      name: 'Dra. Ana Souza',
    });
    expect(loginMock).toHaveBeenCalledWith(PHYSICIAN);
  });

  it('existing account: links with the password, then the MFA code', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValue({
      kind: 'link',
      provider: 'microsoft',
      email: 'medica@example.com',
    });
    apiPostMock.mockImplementation(async (path: string) => {
      if (path === '/auth/oauth/link') return { mfaRequired: true, mfaToken: 'mfa-token' };
      if (path === '/auth/mfa/verify') return { physician: PHYSICIAN };
      throw new Error(`unexpected ${path}`);
    });

    renderLanding({ status: 'link', reason: null });

    expect(
      await screen.findByRole('heading', { name: 'Vincular sua conta Microsoft' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Senha'), 'Senha@Forte1');
    await user.click(screen.getByRole('button', { name: 'Vincular e entrar' }));

    expect(
      await screen.findByRole('heading', { name: 'Verificação em duas etapas' }),
    ).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Dígito 1 de 6'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(apiPostMock).toHaveBeenCalledWith('/auth/oauth/link', { password: 'Senha@Forte1' });
    expect(apiPostMock).toHaveBeenCalledWith('/auth/mfa/verify', {
      mfaToken: 'mfa-token',
      code: '123456',
    });
    expect(loginMock).toHaveBeenCalledWith(PHYSICIAN);
  });

  it('existing account: a wrong password does not sign in', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValue({ kind: 'link', provider: 'google', email: 'medica@example.com' });
    apiPostMock.mockRejectedValue(new ApiError(401, 'Sessão expirada'));

    renderLanding({ status: 'link', reason: null });

    await user.type(await screen.findByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Vincular e entrar' }));

    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('linked account with MFA: asks for the code from the pending step', async () => {
    apiGetMock.mockResolvedValue({ kind: 'mfa', provider: 'google', mfaToken: 'mfa-token' });

    renderLanding({ status: 'mfa', reason: null });

    expect(
      await screen.findByRole('heading', { name: 'Verificação em duas etapas' }),
    ).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/auth/oauth/pending');
  });
});
