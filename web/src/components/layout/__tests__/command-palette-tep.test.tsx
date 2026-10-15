import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../command-palette';

const push = vi.fn();

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

vi.mock('@/lib/clinical-queries', () => ({
  useEncounterList: () => ({ data: undefined, isFetching: false }),
}));

// Com todas as ferramentas do ANY no ar, o ACLS volta a "em breve" só aqui,
// para conferir que o ⌘K não oferece o que não abre.
vi.mock('@clinical-tools/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clinical-tools/catalog')>();
  return {
    ...actual,
    searchTools: (query: string) =>
      actual.searchTools(
        query,
        actual.TOOLS.map((tool) =>
          tool.id === 'acls' ? { ...tool, status: 'em-breve' as const } : tool,
        ),
      ),
  };
});

describe('CommandPalette — TEP (CC-318)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    push.mockClear();
  });

  it.each(['embolia', 'wells', 'hestia'])('"%s" abre o roteiro do TEP', async (term) => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), term);

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Tromboembolismo pulmonar/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/tep');
  });

  it('ferramenta ainda "em breve" não aparece', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'acls');

    expect(
      screen.queryByRole('option', { name: /Parada cardiorrespiratória/ }),
    ).not.toBeInTheDocument();
  });
});
