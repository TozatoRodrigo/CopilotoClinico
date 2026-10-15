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

  it('com a flag ligada, abre a droga de Infusões direto pelo nome ou sinônimo (CC-311)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'nora');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    expect(within(group).getByRole('option', { name: /^Infusões contínuas/ })).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('option', { name: /^Noradrenalina/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/infusoes?droga=noradrenalina');
  });

  it('com a flag ligada, acha o ACLS pelo sinônimo "pcr" e abre a rota dele', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'pcr');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(
      within(group).getByRole('option', { name: /Parada cardiorrespiratória \(ACLS\)/ }),
    );
    expect(push).toHaveBeenCalledWith('/ferramentas/acls');
  });

  it('com a flag ligada, acha a via aérea pelo sinônimo e abre o roteiro', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'iot');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(
      within(group).getByRole('option', { name: /Intubação e via aérea difícil/ }),
    );
    expect(push).toHaveBeenCalledWith('/ferramentas/via-aerea');
  });

  it('com a flag ligada, acha o roteiro de Toxicologia pelo antídoto (CC-323)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'naloxona');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Intoxicações e antídotos/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/toxicologia');
  });

  it('com a flag ligada, acha o roteiro pelo sinônimo e abre a rota dele (CC-326)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'cetoacidose');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /CAD e EHH/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/cad-ehh');
  });

  it('com a flag ligada, acha a Pediatria por "broselow" e abre a ferramenta', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'broselow');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Emergência pediátrica/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/pediatria');
  });

  it('com a flag ligada, acha a Dengue pelo sinônimo e abre a ferramenta (CC-325)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'chikungunya');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Dengue/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/dengue');
  });

  it('com a flag ligada, acha a ferramenta pelo que ela tem dentro e abre a rota dela', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'hipodermóclise');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Cuidados paliativos no PS/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/paliativos');
  });

  it('com a flag ligada, acha os Bloqueios regionais pelo anestésico (CC-330)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FERRAMENTAS', 'on');
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('combobox'), 'lidocaina');

    const group = await screen.findByRole('group', { name: 'Ferramentas' });
    await userEvent.click(within(group).getByRole('option', { name: /Bloqueios regionais/ }));
    expect(push).toHaveBeenCalledWith('/ferramentas/bloqueios');
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
