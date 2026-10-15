import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../command-palette';
import { RouteBreadcrumbs } from '../route-breadcrumbs';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/ferramentas/sedacao',
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

describe('Sedação no ⌘K e na trilha (CC-328)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    push.mockClear();
  });

  it.each(['ketofol', 'agitação', 'contenção química'])(
    'com a flag ligada, "%s" acha a sedação e abre o roteiro',
    async (query) => {
      vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
      render(<CommandPalette open onOpenChange={vi.fn()} />);

      await userEvent.type(screen.getByRole('combobox'), query);

      const group = await screen.findByRole('group', { name: 'Ferramentas' });
      await userEvent.click(
        within(group).getByRole('option', { name: /Sedação procedimental e agitação/ }),
      );
      expect(push).toHaveBeenCalledWith('/ferramentas/sedacao');
    },
  );

  it('mostra Ferramentas › Sedação procedimental e agitação na trilha da rota', () => {
    render(<RouteBreadcrumbs />);
    expect(screen.getByRole('link', { name: /Ferramentas/ })).toHaveAttribute(
      'href',
      '/ferramentas',
    );
    expect(screen.getByText('Sedação procedimental e agitação')).toBeInTheDocument();
  });
});
