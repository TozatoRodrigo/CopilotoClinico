import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../command-palette';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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

describe('CommandPalette — Ferramentas (ADR-017)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    push.mockClear();
  });

  it('com a flag ligada, acha a calculadora pelo sinônimo e abre a rota dela', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'pneumonia');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /CURB-65/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/calculadoras/curb65');
  });

  it('com a flag ligada, acha a Pediatria por "broselow" e abre a ferramenta', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'broselow');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Emergência pediátrica/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/pediatria');
  });

  it('com a flag ligada, a página Ferramentas aparece em Páginas', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'ferram');

    const pages = await screen.findByRole('group', { name: 'Páginas' });
    expect(within(pages).getByRole('option', { name: 'Ferramentas' })).toBeInTheDocument();
  });

  it('com a flag desligada, não oferece Ferramentas', async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'qsofa');

    expect(screen.queryByRole('group', { name: 'Ferramentas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /qSOFA/ })).not.toBeInTheDocument();
  });
});
