import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BetaActivationReport,
  BetaInviteListResponse,
  BetaInviteView,
  BetaWaitlistEntryView,
  BetaWaitlistListResponse,
} from '@contracts/beta';
import BetaAdminPage from '../page';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiDeleteMock = vi.fn();
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
      post: (...args: unknown[]) => apiPostMock(...args),
      delete: (...args: unknown[]) => apiDeleteMock(...args),
    },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function invite(overrides: Partial<BetaInviteView> = {}): BetaInviteView {
  return {
    id: 'invite-1',
    code: 'K3MQ-9XPT',
    batchLabel: 'rede Ripardo',
    maxUses: 1,
    usesCount: 1,
    expiresAt: '2026-11-14T12:00:00.000Z',
    revokedAt: null,
    createdAt: '2026-10-15T09:00:00.000Z',
    status: 'exhausted',
    fromWaitlist: false,
    uses: [
      {
        physicianId: 'p-1',
        name: 'Dra. Ana',
        email: 'ana@example.com',
        joinedAt: '2026-10-15T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const entry: BetaWaitlistEntryView = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'dr.bruno@example.com',
  profile: { training: 'recem_formado', facilityType: 'upa_porte_1', uf: 'BA' },
  contactConsentAt: '2026-10-14T12:00:00.000Z',
  status: 'waiting',
  createdAt: '2026-10-14T12:00:00.000Z',
  invite: null,
};

const invites: BetaInviteListResponse = {
  invites: [
    invite(),
    invite({ id: 'invite-2', code: 'ABCD-EFGH', status: 'active', usesCount: 0, uses: [] }),
  ],
  batches: [{ batchLabel: 'rede Ripardo', invites: 2, uses: 1 }],
};

const waitlist: BetaWaitlistListResponse = {
  entries: [entry],
  counts: { waiting: 1, invited: 0, registered: 0 },
};

const activation: BetaActivationReport = {
  days: 30,
  target: 0.7,
  overall: {
    registered: 12,
    eligible: 10,
    activated24h: 6,
    activatedRealCase24h: 4,
    rate: 0.6,
    realCaseRate: 0.4,
  },
  byBatch: [
    {
      batchLabel: 'rede Ripardo',
      registered: 8,
      eligible: 7,
      activated24h: 5,
      activatedRealCase24h: 3,
      rate: 0.714,
      realCaseRate: 0.429,
    },
    {
      batchLabel: null,
      registered: 4,
      eligible: 3,
      activated24h: 1,
      activatedRealCase24h: 1,
      rate: 0.333,
      realCaseRate: 0.333,
    },
  ],
  generatedAt: '2026-10-15T12:00:00.000Z',
};

/** O user-event troca a Clipboard API no setup: o stub vem depois dele. */
function setupUser() {
  const user = userEvent.setup();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: writeTextMock } });
  return user;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<BetaAdminPage />, { wrapper: Wrapper });
}

describe('Console admin — beta (CC-702)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = 'admin';
    writeTextMock.mockResolvedValue(undefined);
    apiGetMock.mockImplementation((path: string) => {
      if (path === '/admin/beta/invites') return Promise.resolve(invites);
      if (path === '/admin/beta/waitlist') return Promise.resolve(waitlist);
      if (path === '/admin/beta/activation') return Promise.resolve(activation);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists invites with status, uses and batch totals', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Convites do beta' });
    expect(within(list).getByText('K3MQ-9XPT')).toBeInTheDocument();
    expect(within(list).getByText('Usado')).toBeInTheDocument();
    expect(within(list).getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Usos do convite K3MQ-9XPT' })).toHaveTextContent(
      'Dra. Ana · ana@example.com',
    );
    expect(screen.getByText('rede Ripardo: 2 códigos, 1 cadastro')).toBeInTheDocument();
  });

  it('generates a batch and offers the links to copy', async () => {
    apiPostMock.mockResolvedValue({
      invites: [
        invite({ id: 'n-1', code: 'AAAA-BBBB', status: 'active', usesCount: 0, uses: [] }),
        invite({ id: 'n-2', code: 'CCCC-DDDD', status: 'active', usesCount: 0, uses: [] }),
      ],
    });
    const user = setupUser();
    renderPage();

    await screen.findByRole('list', { name: 'Convites do beta' });
    await user.click(screen.getByRole('button', { name: 'Gerar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o lote ou a origem');
    expect(apiPostMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Lote / origem'), 'base ANY');
    await user.clear(screen.getByLabelText('Quantidade'));
    await user.type(screen.getByLabelText('Quantidade'), '2');
    await user.clear(screen.getByLabelText('Usos por código'));
    await user.type(screen.getByLabelText('Usos por código'), '5');
    await user.click(screen.getByRole('button', { name: 'Gerar' }));

    expect(apiPostMock).toHaveBeenCalledWith('/admin/beta/invites', {
      batchLabel: 'base ANY',
      quantity: 2,
      maxUses: 5,
      validDays: 30,
    });
    const created = await screen.findByRole('list', { name: 'Convites gerados' });
    expect(created).toHaveTextContent('AAAA-BBBB');

    await user.click(screen.getByRole('button', { name: 'Copiar os links' }));
    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(
        `${window.location.origin}/register?convite=AAAA-BBBB\n${window.location.origin}/register?convite=CCCC-DDDD`,
      ),
    );
  });

  it('revokes an invite after confirmation', async () => {
    apiPostMock.mockResolvedValue(invite({ id: 'invite-2', status: 'revoked' }));
    const user = setupUser();
    renderPage();

    const list = await screen.findByRole('list', { name: 'Convites do beta' });
    const revokeButtons = within(list).getAllByRole('button', { name: 'Revogar' });
    await user.click(revokeButtons[1]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revogar' }));

    expect(apiPostMock).toHaveBeenCalledWith('/admin/beta/invites/invite-2/revoke');
  });

  it('approves someone from the waitlist and shows the code to send', async () => {
    apiPostMock.mockResolvedValue({
      entry: { ...entry, status: 'invited' },
      invite: invite({
        id: 'w-1',
        code: 'WWWW-XXXX',
        status: 'active',
        usesCount: 0,
        uses: [],
        fromWaitlist: true,
      }),
    });
    const user = setupUser();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /Lista de espera/ }));
    const list = await screen.findByRole('list', { name: 'Lista de espera do beta' });
    expect(within(list).getByText('dr.bruno@example.com')).toBeInTheDocument();
    expect(within(list).getByText(/UPA 24h porte I · BA/)).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Aprovar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Gerar convite' }));

    expect(apiPostMock).toHaveBeenCalledWith(`/admin/beta/waitlist/${entry.id}/approve`, {
      batchLabel: 'lista de espera',
      validDays: 14,
    });
    expect(await within(dialog).findByText('WWWW-XXXX')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Copiar link' }));
    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(
        `${window.location.origin}/register?convite=WWWW-XXXX`,
      ),
    );
  });

  it('deletes a waitlist entry on request', async () => {
    apiDeleteMock.mockResolvedValue(undefined);
    const user = setupUser();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /Lista de espera/ }));
    const list = await screen.findByRole('list', { name: 'Lista de espera do beta' });
    await user.click(within(list).getByRole('button', { name: 'Apagar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }));

    expect(apiDeleteMock).toHaveBeenCalledWith(`/admin/beta/waitlist/${entry.id}`);
  });

  it('shows Compliance only the activation, with the rate against the target', async () => {
    role = 'compliance';
    renderPage();

    expect(screen.queryByRole('tab', { name: /Convites/ })).not.toBeInTheDocument();
    expect(await screen.findByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6 de 10')).toBeInTheDocument();
    expect(screen.getByText('Sem convite')).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith('/admin/beta/activation', { days: '30' });
    expect(apiGetMock).not.toHaveBeenCalledWith('/admin/beta/invites', undefined);
  });
});
