import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LegalStatus, PendingLegalDocument } from '@contracts/legal';
import LegalAcceptancePage from '../page';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const replaceMock = vi.fn();
const pushMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ logout: logoutMock }),
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

function pendingDocument(overrides: Partial<PendingLegalDocument> = {}): PendingLegalDocument {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'terms_of_use',
    version: '2026-10-15-v2-provisorio',
    title: 'Termos de Uso do Copiloto Clínico',
    provisional: true,
    contentHash: 'a'.repeat(64),
    publishedAt: '2026-10-15T18:00:00.000Z',
    changeSummary: ['Passam a cobrir as ferramentas de beira-leito.'],
    sections: [{ heading: '4. Ferramentas de beira-leito', paragraphs: ['Confira as entradas.'] }],
    previouslyAcceptedVersion: null,
    ...overrides,
  };
}

const terms = pendingDocument();
const policy = pendingDocument({
  id: '22222222-2222-4222-8222-222222222222',
  type: 'privacy_policy',
  title: 'Política de Privacidade do Copiloto Clínico',
  changeSummary: ['Inclui os dados do beta.'],
});

function status(pending: PendingLegalDocument[]): LegalStatus {
  return { enabled: true, acceptanceRequired: pending.length > 0, pending };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<LegalAcceptancePage />, { wrapper: Wrapper });
}

describe('LegalAcceptancePage (CC-905)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/aceite-termos?from=%2Fencounters%2Fabc');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('shows what to accept on the first acceptance, marked as provisional', async () => {
    apiGetMock.mockResolvedValue(status([terms, policy]));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Antes de continuar' })).toBeInTheDocument();
    expect(screen.getByText('Texto provisório')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: terms.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: policy.title })).toBeInTheDocument();
    expect(screen.getAllByText('Novidades desta versão')).toHaveLength(2);
    expect(
      screen.getByLabelText(
        'Li e aceito os Termos de Uso e a Política de Privacidade do Copiloto Clínico.',
      ),
    ).toBeInTheDocument();
  });

  it('shows what changed when a newer version replaces an accepted one', async () => {
    apiGetMock.mockResolvedValue(
      status([pendingDocument({ previouslyAcceptedVersion: '2026-06-18', provisional: false })]),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Atualizamos os termos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('O que mudou desde a versão que você aceitou')).toBeInTheDocument();
    expect(screen.getByText('Passam a cobrir as ferramentas de beira-leito.')).toBeInTheDocument();
    expect(screen.queryByText('Texto provisório')).not.toBeInTheDocument();
  });

  it('only accepts after the box is checked, then returns where the physician was', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValue(status([terms, policy]));
    apiPostMock.mockResolvedValue(status([]));
    renderPage();

    const acceptButton = await screen.findByRole('button', { name: 'Aceitar e continuar' });
    await user.click(acceptButton);
    expect(screen.getByText('Marque a caixa para confirmar que leu e aceita.')).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    await user.click(acceptButton);

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith('/legal/acceptances', {
        documentIds: [terms.id, policy.id],
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/encounters/abc'));
  });

  it('reloads the text when a newer version was published meanwhile (409)', async () => {
    const user = userEvent.setup();
    const termsV3 = pendingDocument({ id: '33333333-3333-4333-8333-333333333333', version: 'v3' });
    apiGetMock.mockResolvedValueOnce(status([terms])).mockResolvedValueOnce(status([termsV3]));
    apiPostMock.mockRejectedValue(new ApiError(409, 'Esta versão não é mais a vigente.'));
    renderPage();

    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));

    expect(
      await screen.findByText(/Uma versão nova foi publicada enquanto você lia/),
    ).toBeInTheDocument();
    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('goes back right away when nothing is pending (flag off or already accepted)', async () => {
    apiGetMock.mockResolvedValue({ enabled: false, acceptanceRequired: false, pending: [] });

    renderPage();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/encounters/abc'));
  });

  it('lets a physician who does not agree log out', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValue(status([terms, policy]));
    apiPostMock.mockResolvedValue({});
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(apiPostMock).toHaveBeenCalledWith('/auth/logout');
    expect(logoutMock).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Exportar meus dados' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toBeInTheDocument();
  });
});
