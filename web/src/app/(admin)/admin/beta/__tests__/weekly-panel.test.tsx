import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import BetaAdminPage from '../page';
import { WEEKLY_MARKDOWN, weeklyReport } from './weekly-fixture';

const apiGetMock = vi.fn();
const writeTextMock = vi.fn();
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
      post: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** O user-event troca a Clipboard API no setup: o stub vem depois dele. */
function setupUser() {
  const user = userEvent.setup();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: writeTextMock } });
  return user;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<BetaAdminPage />, { wrapper: Wrapper });
}

/** A semana fechada de 05/10, que a navegação pede. */
const closedWeek = weeklyReport({
  period: {
    current: {
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      from: '2026-10-05T03:00:00.000Z',
      to: '2026-10-12T03:00:00.000Z',
    },
    previous: {
      weekStart: '2026-09-28',
      weekEnd: '2026-10-04',
      from: '2026-09-28T03:00:00.000Z',
      to: '2026-10-05T03:00:00.000Z',
    },
    inProgress: false,
  },
});

describe('Console admin — semana do beta (CC-705)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = 'admin';
    writeTextMock.mockResolvedValue(undefined);
    apiGetMock.mockImplementation((path: string, params?: { week?: string }) => {
      if (path !== '/admin/beta/weekly') return Promise.reject(new Error(`unexpected ${path}`));
      return Promise.resolve(params?.week === '2026-10-05' ? closedWeek : weeklyReport());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens on the week with every number next to the previous week', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Semana/, selected: true })).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/admin/beta/weekly', undefined);
    expect(
      screen.getByText(/Semana em andamento: números até sex 16\/10 às 13:00/),
    ).toBeInTheDocument();

    // Uso
    expect(screen.getByText('anterior: 9 (+3)')).toBeInTheDocument();
    expect(
      screen.getByText('anterior: 25 (+16) · 5 do caso de exemplo, fora da conta'),
    ).toBeInTheDocument();
    expect(screen.getByText('3,4')).toBeInTheDocument();
    expect(screen.getByText('4,9')).toBeInTheDocument();
    const distribution = screen.getByRole('list', {
      name: 'Médicos ativos por número de análises',
    });
    expect(distribution).toHaveTextContent('2 a 4: 5 médicos');
    expect(distribution).toHaveTextContent('só respondeu pergunta: 1 médico');

    // Custo e latência
    expect(screen.getByText(/US\$\s0,21/)).toBeInTheDocument();
    expect(screen.getByText('38,2 s')).toBeInTheDocument();
    expect(screen.getByText('71 s')).toBeInTheDocument();

    // Lacunas e ativação por lote
    const gaps = screen.getByRole('list', { name: 'Lacunas mais frequentes' });
    expect(within(gaps).getByText('dor-toracica')).toBeInTheDocument();
    expect(within(gaps).getByText('sem síndrome registrada')).toBeInTheDocument();
    const batches = screen.getByRole('list', { name: 'Ativação por lote' });
    expect(within(batches).getByText('80% (4 de 5)')).toBeInTheDocument();
    expect(within(batches).getByText('anterior: 75% (3 de 4)')).toBeInTheDocument();
    expect(within(batches).getByText('Sem convite')).toBeInTheDocument();
  });

  it('says where the missing numbers will come from instead of showing zero', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' });

    expect(screen.getAllByText('sem dado')).toHaveLength(3);
    expect(
      screen.getByText('CC-408: A decisão ainda não usa cartões revisados.'),
    ).toBeInTheDocument();
    expect(screen.getByText('CC-304: A área Ferramentas ainda não existe.')).toBeInTheDocument();
    expect(
      screen.getByText('CC-707: Os pedidos de mentoria ainda não são gravados.'),
    ).toBeInTheDocument();
  });

  it('shows the number once the source story records it (extension point)', async () => {
    apiGetMock.mockResolvedValue(
      weeklyReport({
        cardUsage: {
          available: true,
          current: { analyses: 41, withCard: 13, rate: 0.317 },
          previous: { analyses: 25, withCard: 5, rate: 0.2 },
        },
      }),
    );
    renderPage();

    expect(await screen.findByText('32% (13 de 41)')).toBeInTheDocument();
    expect(screen.getByText('anterior: 20% (5 de 25)')).toBeInTheDocument();
    expect(screen.getAllByText('sem dado')).toHaveLength(2);
  });

  it('copies the markdown summary for the meeting minutes', async () => {
    const user = setupUser();
    renderPage();
    await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' });

    await user.click(screen.getByRole('button', { name: 'Copiar resumo para a ata' }));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith(WEEKLY_MARKDOWN));
    expect(toast.success).toHaveBeenCalledWith(
      'Resumo copiado. Cole na ata da reunião no Meeting Tracker.',
    );
  });

  it('walks back to a closed week and returns to the current one', async () => {
    const user = setupUser();
    renderPage();
    await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' });
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Semana anterior/ }));

    expect(
      await screen.findByRole('heading', { name: 'Semana de 05/10 a 11/10/2026' }),
    ).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/admin/beta/weekly', { week: '2026-10-05' });
    expect(screen.getByText(/Semana inteira, de segunda a domingo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Semana atual/ }));
    expect(
      await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Semana atual/ })).not.toBeInTheDocument();
  });

  it('opens on the week for Compliance too', async () => {
    role = 'compliance';
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Convites/ })).not.toBeInTheDocument();
  });

  it('offers a retry when the week fails to load', async () => {
    apiGetMock.mockRejectedValueOnce(new Error('Falha de rede'));
    const user = setupUser();
    renderPage();

    expect(await screen.findByText('Não foi possível carregar a semana')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByRole('heading', { name: 'Semana de 12/10 a 18/10/2026' }),
    ).toBeInTheDocument();
  });
});
