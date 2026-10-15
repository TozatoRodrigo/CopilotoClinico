import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../command-palette';
import { RouteBreadcrumbs } from '../route-breadcrumbs';

const push = vi.fn();
const pathname = vi.hoisted(() => ({ current: '/ferramentas/ventilacao-mecanica' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: () => ({ role: 'physician' }),
}));

vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

vi.mock('@/lib/clinical-queries', () => ({
  useEncounterList: () => ({ data: undefined, isFetching: false }),
  useEncounterDetail: () => ({ data: undefined }),
}));

// CC-502 — a busca no servidor fica de fora: aqui só importam as ferramentas, locais.
vi.mock('@/lib/unified-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/unified-search')>()),
  useUnifiedSearch: () => ({ data: undefined, isPending: true, isError: false, isFetching: false }),
}));

describe('Ventilação mecânica no ⌘K e na trilha (CC-327)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    push.mockClear();
  });

  it.each(['rox', 'hacor', 'driving pressure', 'peso predito'])(
    'acha a ferramenta por "%s" e abre a rota dela',
    async (query) => {
      vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
      render(<CommandPalette open onOpenChange={vi.fn()} />);

      await userEvent.type(screen.getByRole('combobox'), query);

      const group = await screen.findByRole('group', { name: 'Ferramentas' });
      await userEvent.click(within(group).getByRole('option', { name: /Ventilação mecânica/ }));
      expect(push).toHaveBeenCalledWith('/ferramentas/ventilacao-mecanica');
    },
  );

  it('com a flag desligada, não oferece a ferramenta', async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'hacor');

    expect(screen.queryByRole('option', { name: /Ventilação mecânica/ })).not.toBeInTheDocument();
  });

  it('mostra Ferramentas › Ventilação mecânica na trilha', () => {
    render(<RouteBreadcrumbs />);

    expect(screen.getByRole('link', { name: 'Ferramentas' })).toHaveAttribute(
      'href',
      '/ferramentas',
    );
    expect(screen.getByText('Ventilação mecânica')).toBeInTheDocument();
  });
});
