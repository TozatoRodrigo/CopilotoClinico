import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndifferentiatedShockScreen } from '../_components/undifferentiated-shock-screen';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ferramentas/choque-indiferenciado',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function field(name: RegExp) {
  return screen.getByRole('textbox', { name });
}

async function answer(group: string, option: string) {
  await userEvent.click(within(screen.getByRole('group', { name: group })).getByLabelText(option));
}

async function measure(vti: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar ecocardiografia básica' }));
  await userEvent.type(field(/VTI da via de saída do VE/), vti);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('/ferramentas/choque-indiferenciado — VTI (CC-317)', () => {
  it('critério de aceite: VTI < 16 cm segue a investigação do baixo débito até o tipo de choque', async () => {
    render(<UndifferentiatedShockScreen />);
    await measure('12');

    expect(screen.getByText('VTI < 16 cm — Baixo débito cardíaco')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Investigar causa' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Baixo débito cardíaco' })).toHaveFocus();

    await answer('Função pericárdica comprometida?', 'Não');
    await answer('Função do VD comprometida?', 'Não');
    await answer('Função do VE comprometida?', 'Sim');

    expect(screen.getByText('Choque cardiogênico')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Função valvar comprometida?' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calcular dobutamina' })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=dobutamina&de=choque-indiferenciado',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Resultado da classificação' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Disfunção sistólica de VE')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar VTI' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Classificação hemodinâmica' }),
    ).toBeInTheDocument();
  });

  it('VTI entre 16 e 20 cm vai para a zona cinzenta, e a perfusão decide', async () => {
    render(<UndifferentiatedShockScreen />);
    await measure('18');
    await userEvent.click(screen.getByRole('button', { name: 'Avaliar perfusão' }));

    await userEvent.type(field(/^SvcO2/), '75');
    await userEvent.type(field(/Gap de pCO2/), '4');
    await answer('Tendência do lactato', 'Estável/decrescente');

    expect(screen.getByText('Padrão compatível com choque distributivo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choque distributivo' }));
    expect(screen.getByRole('link', { name: 'Calcular noradrenalina' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));
    expect(screen.getByText('Débito cardíaco adequado, RVP reduzida')).toBeInTheDocument();
  });

  it('VTI > 20 cm leva direto ao choque distributivo', async () => {
    render(<UndifferentiatedShockScreen />);
    await measure('22');
    expect(screen.getByText('VTI > 20 cm — Débito cardíaco adequado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choque distributivo' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Choque distributivo' }),
    ).toBeInTheDocument();
  });

  it('todas as causas estruturais negadas abrem a fluidorresponsividade pelo modo ventilatório', async () => {
    render(<UndifferentiatedShockScreen />);
    await measure('10');
    await userEvent.click(screen.getByRole('button', { name: 'Investigar causa' }));
    for (const question of [
      'Função pericárdica comprometida?',
      'Função do VD comprometida?',
      'Função do VE comprometida?',
      'Função valvar comprometida?',
    ]) {
      await answer(question, 'Não');
    }
    await answer('Modo ventilatório', 'Ventilação mecânica');
    expect(screen.getByText('Variação dinâmica')).toBeInTheDocument();
    await answer('Responsivo a fluidos?', 'Não');
    expect(screen.getByText('Não responsivo a fluidos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver resumo' })).not.toBeInTheDocument();
  });
});

describe('/ferramentas/choque-indiferenciado — VNERi e gap CO2 avulsos (CC-317)', () => {
  it('calcula o VNERi ao vivo com zona e mortalidade', async () => {
    render(<UndifferentiatedShockScreen />);
    await userEvent.click(screen.getByRole('tab', { name: 'VNERi' }));

    await userEvent.type(field(/^PAD/), '60');
    await userEvent.type(field(/^FC/), '100');
    await userEvent.type(field(/Dose de noradrenalina/), '0,3');

    const result = screen
      .getAllByRole('status')
      .find((node) => node.textContent?.includes('VNERi'));
    expect(result).toHaveTextContent('2,0');
    expect(result).toHaveTextContent('Hiporresponsividade grave');
    expect(result).toHaveTextContent('Mortalidade: ~56%');
  });

  it('mostra o quadrante do gap CO2 × SvcO2 e marca a célula na grade', async () => {
    render(<UndifferentiatedShockScreen />);
    await userEvent.click(screen.getByRole('tab', { name: 'Gap CO2 × SvcO2' }));

    await userEvent.type(field(/^SvcO2/), '65');
    await userEvent.type(field(/^Gap CO2/), '8,5');

    expect(screen.getByText('Baixo débito cardíaco / estase')).toBeInTheDocument();
    const grid = screen.getByRole('list', { name: 'Quadrantes gap CO2 × SvcO2' });
    expect(
      within(grid)
        .getByText(/Baixo débito \/ estase/)
        .closest('li'),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('volta à mesma aba e ao mesmo passo depois de sair da tela', async () => {
    const { unmount } = render(<UndifferentiatedShockScreen />);
    await measure('12');
    await userEvent.click(screen.getByRole('button', { name: 'Investigar causa' }));
    await answer('Função pericárdica comprometida?', 'Sim');
    unmount();

    render(<UndifferentiatedShockScreen />);
    expect(screen.getByText('Avaliação retomada nesta aba')).toBeInTheDocument();
    expect(screen.getByText('Tamponamento cardíaco')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Recomeçar' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Classificação hemodinâmica' }),
    ).toBeInTheDocument();
  });
});
