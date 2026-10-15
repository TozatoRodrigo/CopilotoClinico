import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../command-palette';
import { RouteBreadcrumbs } from '../route-breadcrumbs';

const push = vi.fn();
let pathname = '/ferramentas';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
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

describe('roteiros das Ferramentas no ⌘K e na trilha (CC-316, CC-317)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    push.mockClear();
  });

  it('o ⌘K acha o Choque séptico pelo sinônimo e abre o roteiro', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'andromeda');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Choque séptico/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/choque-septico');
  });

  it('o ⌘K acha o Choque indiferenciado pelo VNERi (CC-317)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'vneri');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Choque indiferenciado/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/choque-indiferenciado');
  });

  it('a trilha mostra Ferramentas › Choque séptico', () => {
    pathname = '/ferramentas/choque-septico';
    render(<RouteBreadcrumbs />);

    const trail = screen.getByRole('navigation');
    expect(within(trail).getByRole('link', { name: /Ferramentas/ })).toHaveAttribute(
      'href',
      '/ferramentas',
    );
    expect(within(trail).getByText('Choque séptico')).toBeInTheDocument();
  });
});
