import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LegalAdminOverview } from '@contracts/legal';
import LegalDocumentsAdminPage from '../page';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
let role: 'admin' | 'compliance' = 'admin';

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ role }),
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

const HASH = 'b'.repeat(64);

function overview(overrides: Partial<LegalAdminOverview> = {}): LegalAdminOverview {
  return {
    enabled: true,
    eligibleAccounts: 40,
    fullyAccepted: 10,
    types: [
      {
        type: 'terms_of_use',
        label: 'Termos de Uso',
        current: {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'terms_of_use',
          version: '2026-10-15-v2-provisorio',
          title: 'Termos de Uso do Copiloto Clínico',
          provisional: true,
          contentHash: HASH,
          publishedAt: '2026-10-15T18:00:00.000Z',
          changeSummary: ['Passam a cobrir a mentoria.'],
          sections: [],
          acceptance: { accepted: 12, eligible: 40, percent: 30 },
        },
        history: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            version: '2026-10-15-v2-provisorio',
            provisional: true,
            contentHash: HASH,
            publishedAt: '2026-10-15T18:00:00.000Z',
            accepted: 12,
          },
        ],
        drafts: [],
      },
      {
        type: 'privacy_policy',
        label: 'Política de Privacidade',
        current: null,
        history: [],
        drafts: [
          {
            version: '2026-10-15-v2-provisorio',
            title: 'Política de Privacidade do Copiloto Clínico',
            provisional: true,
            contentHash: HASH,
            changeSummary: ['Inclui os dados do beta.'],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<LegalDocumentsAdminPage />, { wrapper: Wrapper });
}

describe('LegalDocumentsAdminPage (CC-905)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = 'admin';
  });

  it('shows the acceptance rate of the current version and of all accounts', async () => {
    apiGetMock.mockResolvedValue(overview());

    renderPage();

    expect(await screen.findByText('25%')).toBeInTheDocument();
    expect(screen.getByText('10 de 40 contas aceitaram termos e política')).toBeInTheDocument();
    const terms = screen.getByRole('region', { name: 'Termos de Uso' });
    expect(within(terms).getByText('30%')).toBeInTheDocument();
    expect(within(terms).getByText('12 de 40 contas')).toBeInTheDocument();
    expect(within(terms).getByText('Provisório')).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/admin/legal/documents');
  });

  it('lets an admin publish a draft after confirming', async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValue(overview());
    apiPostMock.mockResolvedValue({});
    renderPage();

    const policy = await screen.findByRole('region', { name: 'Política de Privacidade' });
    expect(within(policy).getByText('Nenhuma versão publicada.')).toBeInTheDocument();
    await user.click(within(policy).getByRole('button', { name: 'Publicar' }));
    await user.click(await screen.findByRole('button', { name: 'Publicar versão' }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith('/admin/legal/documents', {
        type: 'privacy_policy',
        version: '2026-10-15-v2-provisorio',
      }),
    );
  });

  it('does not offer publishing to compliance', async () => {
    role = 'compliance';
    apiGetMock.mockResolvedValue(overview());

    renderPage();

    const policy = await screen.findByRole('region', { name: 'Política de Privacidade' });
    expect(within(policy).queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(within(policy).getByText('Só ADMIN publica')).toBeInTheDocument();
  });

  it('says when the flag is off', async () => {
    apiGetMock.mockResolvedValue(overview({ enabled: false }));

    renderPage();

    expect(await screen.findByText('Aceite desligado')).toBeInTheDocument();
  });
});
