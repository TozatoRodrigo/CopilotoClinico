import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UnifiedSearchResponse } from '@/lib/types';
import { CommandPalette } from '../command-palette';

const push = vi.fn();

const mocks = vi.hoisted(() => ({
  online: true,
  refetch: vi.fn(),
  result: null as null | {
    data?: unknown;
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
  },
  useUnifiedSearch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ role: 'physician' }),
}));

vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

vi.mock('@/components/providers/offline-provider', () => ({
  useOnlineStatus: () => ({ isOnline: mocks.online }),
}));

vi.mock('@/lib/clinical-queries', () => ({
  useEncounterList: () => ({ data: undefined, isFetching: false }),
}));

vi.mock('@/lib/unified-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/unified-search')>()),
  useUnifiedSearch: mocks.useUnifiedSearch,
}));

const CARD_ID = '77777777-7777-4777-8777-777777777777';
const CASE_ID = '11111111-1111-4111-8111-111111111111';

const RESULTS: UnifiedSearchResponse = {
  cards: {
    status: 'ok',
    items: [
      {
        id: CARD_ID,
        topic: 'Noradrenalina em infusão contínua',
        question: 'Qual a dose de Noradrenalina em infusão contínua no adulto?',
        syndrome: 'choque',
      },
    ],
  },
  protocols: {
    status: 'ok',
    items: [
      {
        source: 'Protocolo de choque',
        sourceVersion: '2025',
        specialty: 'clinica_medica',
        institutional: true,
      },
    ],
  },
  cases: {
    status: 'ok',
    items: [
      {
        id: CASE_ID,
        patientRef: 'Leito 4',
        chiefComplaint: 'Hipotensão após sepse urinária',
        status: 'in_review',
        createdAt: '2026-10-14T20:00:00.000Z',
        syndrome: 'choque',
      },
    ],
  },
};

const READY = { data: RESULTS, isPending: false, isError: false, isFetching: false };

function groupNames(): string[] {
  return screen.getAllByRole('group').map((group) => group.getAttribute('aria-label') ?? '');
}

async function typeQuery(query: string) {
  render(<CommandPalette open onOpenChange={vi.fn()} />);
  const input = screen.getByRole('combobox');
  await userEvent.type(input, query);
  return input;
}

describe('CommandPalette — busca única (CC-502)', () => {
  beforeEach(() => {
    mocks.online = true;
    mocks.result = READY;
    mocks.useUnifiedSearch.mockImplementation((query: string | null) =>
      query === null
        ? {
            data: undefined,
            isPending: true,
            isError: false,
            isFetching: false,
            refetch: mocks.refetch,
          }
        : { ...mocks.result, refetch: mocks.refetch },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    push.mockClear();
    mocks.refetch.mockClear();
    mocks.useUnifiedSearch.mockReset();
  });

  it('mostra Ferramentas, Cartões, Protocolos e Casos, nessa ordem', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    await typeQuery('nora');

    await screen.findByRole('group', { name: 'Cartões' });
    expect(groupNames()).toEqual(['Ferramentas', 'Cartões', 'Protocolos', 'Casos']);
    // "nora" é sinônimo: acha a droga nas Ferramentas e o cartão importado do ANY.
    expect(
      within(screen.getByRole('group', { name: 'Ferramentas' })).getByRole('option', {
        name: /^Noradrenalina/,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Cartões' })).getByRole('option', {
        name: /Noradrenalina em infusão contínua/,
      }),
    ).toBeInTheDocument();
  });

  it('só vai ao servidor depois da pausa na digitação, com a busca inteira', async () => {
    await typeQuery('nora');
    await screen.findByRole('group', { name: 'Cartões' });

    const queries = mocks.useUnifiedSearch.mock.calls.map(([query]) => query);
    expect(queries.filter((query) => query !== null)).not.toHaveLength(0);
    expect(new Set(queries.filter((query) => query !== null))).toEqual(new Set(['nora']));
  });

  it('o teclado percorre os grupos na ordem da tela e abre o cartão', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    const input = await typeQuery('nora');
    await screen.findByRole('group', { name: 'Cartões' });

    const visited: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const active = input.getAttribute('aria-activedescendant') ?? '';
      visited.push(active);
      if (active === `cmd-card-${CARD_ID}`) break;
      await userEvent.keyboard('{ArrowDown}');
    }
    expect(visited[0]).toMatch(/^cmd-(infusao|tool|calc)-/);
    expect(visited.at(-1)).toBe(`cmd-card-${CARD_ID}`);

    await userEvent.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith(`/cartoes/${CARD_ID}`);
  });

  it('↑ no primeiro item vai para o último grupo, e o caso abre só pelo id', async () => {
    const input = await typeQuery('choque');
    await screen.findByRole('group', { name: 'Casos' });

    await userEvent.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', `cmd-case-${CASE_ID}`);

    await userEvent.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith(`/encounters/${CASE_ID}`);
  });

  it('o caso mostra rótulo, data, síndrome e status — achado sem texto clínico na URL', async () => {
    await typeQuery('choque');

    const cases = await screen.findByRole('group', { name: 'Casos' });
    const option = within(cases).getByRole('option');
    expect(option).toHaveTextContent('Hipotensão após sepse urinária');
    expect(option).toHaveTextContent('Leito 4 · 14/10 · Choque · Em revisão');
  });

  it('o protocolo abre as Diretrizes buscando pelo título dele, não pelo que foi digitado', async () => {
    await typeQuery('choque');

    const protocols = await screen.findByRole('group', { name: 'Protocolos' });
    await userEvent.click(within(protocols).getByRole('option', { name: /Protocolo de choque/ }));
    expect(push).toHaveBeenCalledWith('/guidelines?q=Protocolo%20de%20choque');
  });

  it('enquanto o servidor não responde, as ferramentas já aparecem e o resto diz que está buscando', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    mocks.result = { data: undefined, isPending: true, isError: false, isFetching: true };

    await typeQuery('nora');

    expect(await screen.findByRole('group', { name: 'Ferramentas' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Buscando cartões, protocolos e casos…');
    expect(screen.queryByRole('group', { name: 'Cartões' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
  });

  it('sem conexão, as ferramentas funcionam e o ⌘K avisa que cartões e casos precisam de internet', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    mocks.online = false;

    await typeQuery('nora');

    expect(await screen.findByRole('group', { name: 'Ferramentas' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sem conexão: cartões, protocolos e casos precisam de internet. As ferramentas funcionam sem sinal.',
    );
    expect(groupNames()).toEqual(['Ferramentas']);
    for (const [, options] of mocks.useUnifiedSearch.mock.calls) {
      expect(options).toEqual({ online: false });
    }
  });

  it('erro na busca: avisa e tenta de novo', async () => {
    mocks.result = { data: undefined, isPending: false, isError: true, isFetching: false };

    await typeQuery('choque');

    // Antes da pausa da digitação o status é "buscando"; depois, o erro.
    expect(
      await screen.findByText('Não foi possível buscar cartões, protocolos e casos.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('um grupo que falhou no servidor mostra o erro só nele', async () => {
    mocks.result = { ...READY, data: { ...RESULTS, cases: { status: 'error' } } };

    await typeQuery('choque');

    const cases = await screen.findByRole('group', { name: 'Casos' });
    expect(cases).toHaveTextContent('Não foi possível buscar casos agora.');
    expect(screen.getByRole('group', { name: 'Cartões' })).toBeInTheDocument();
  });

  it('sem nada em lugar nenhum, diz que não achou', async () => {
    mocks.result = {
      data: {
        cards: { status: 'ok', items: [] },
        protocols: { status: 'ok', items: [] },
        cases: { status: 'ok', items: [] },
      },
      isPending: false,
      isError: false,
      isFetching: false,
    };

    await typeQuery('zzzz');

    expect(await screen.findByText('Nada encontrado para “zzzz”.')).toBeInTheDocument();
  });
});
