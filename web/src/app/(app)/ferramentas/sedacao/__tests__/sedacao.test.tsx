import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FerramentasPage from '../../page';
import SedacaoPage from '../page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/ferramentas/sedacao',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), info: vi.fn() },
}));

const WEIGHT_KEY = 'copiloto:ferramentas:sessao:peso-adulto';
const STATE_KEY = 'copiloto:ferramentas:sessao:sedacao';

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  toastSuccess.mockClear();
});

async function choose(name: RegExp | string) {
  await userEvent.click(screen.getByRole('button', { name }));
}

function heading() {
  return screen.getByRole('heading', { level: 2 });
}

function weightField() {
  return screen.getByRole('textbox', { name: /Peso/ });
}

describe('/ferramentas — Sedação no hub (CC-328)', () => {
  it('sai de "em breve" e abre em um toque', () => {
    render(<FerramentasPage />);
    const group = screen.getByRole('region', { name: 'Sedação e dor' });
    expect(
      within(group).getByRole('link', { name: /Sedação procedimental e agitação/ }),
    ).toHaveAttribute('href', '/ferramentas/sedacao');
  });
});

describe('/ferramentas/sedacao', () => {
  it('abre na triagem, com aviso fixo, procedência e os três graus de colaboração', () => {
    render(<SedacaoPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sedação procedimental e agitação' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Apoio à decisão');
    expect(
      screen.getByText(/SedaPath\.tsx \(95c8fba\).*revisão clínica pendente/),
    ).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Avaliação inicial');
    for (const name of [/^Colaborativo/, /^Pouco colaborativo/, /^Combativo/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /Copiar para o prontuário/ })).toBeNull();
  });

  it('critério 1: pouco colaborativo, urgente, sem acesso IV → cetamina IM 5 mg/kg pelo peso', async () => {
    render(<SedacaoPage />);
    await choose(/^Pouco colaborativo/);
    expect(screen.getByText('Clonazepam 0,5–1 mg VO')).toBeInTheDocument();
    await choose(/^Urgente — preciso agora/);
    await choose(/^Não — sem acesso IV/);
    expect(heading()).toHaveTextContent('Sedação IM — onset rápido');

    // Sem medicação escolhida não há como seguir.
    expect(screen.queryByRole('button', { name: /Durante sedação/ })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: /Cetamina IM/ }));
    expect(screen.getByText('5 mg/kg IM')).toBeInTheDocument();

    await userEvent.type(weightField(), '70');
    const dose = document.querySelector<HTMLElement>('[data-slot="ketamine-dose"]');
    expect(dose).toHaveTextContent('Dose total350 mg');
    expect(dose).toHaveTextContent('Volume (50 mg/mL)7,0 mL');
    expect(screen.getByRole('button', { name: /Durante sedação/ })).toBeEnabled();
  });

  it('critério 1: combativo → midazolam 7,5 mg + haloperidol 5 mg + prometazina 50 mg IM', async () => {
    render(<SedacaoPage />);
    await choose(/^Combativo/);
    expect(screen.getByText('Risco imediato')).toBeInTheDocument();
    // As saídas aparecem depois da contenção química.
    expect(screen.queryByRole('button', { name: /^Contenção suficiente/ })).toBeNull();

    const option = screen.getByRole('radio', {
      name: /Midazolam \+ Haloperidol \+ Prometazina IM/,
    });
    await userEvent.click(option);
    expect(option).toBeChecked();
    expect(
      screen.getByText('Midazolam 7,5 mg + Haloperidol 5 mg + Prometazina 50 mg IM'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Contenção suficiente/ })).toBeInTheDocument();
  });

  it('critério 1: pouco colaborativo não urgente → haloperidol + prometazina IM', async () => {
    render(<SedacaoPage />);
    await choose(/^Pouco colaborativo/);
    await choose(/^Não urgente/);
    expect(screen.getByText('Haloperidol 5 mg + Prometazina 50 mg IM')).toBeInTheDocument();
    expect(
      screen.getByText('Pode repetir haloperidol em 30 min (máx. 40 mg/dia)'),
    ).toBeInTheDocument();
  });

  it('critério 1: colaborativo que precisa de sedação → midazolam ou clonazepam VO', async () => {
    render(<SedacaoPage />);
    await choose(/^Colaborativo/);
    await choose(/^Sim — precisa de sedação/);
    expect(screen.getByText('Midazolam 7,5–15 mg VO')).toBeInTheDocument();
    expect(screen.getByText('ou Clonazepam 0,5–1 mg VO')).toBeInTheDocument();
  });

  it('critério 1: sedação nas últimas 4 h → cetofol pela metade (0,25 e 0,125 mg/kg)', async () => {
    render(<SedacaoPage />);
    await choose(/^Pouco colaborativo/);
    await userEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(screen.getByText('Já recebeu sedação e não foi suficiente')).toBeInTheDocument();
    await choose(/^Urgente — preciso agora/);
    await choose(/^Sim — tem acesso IV/);
    // A mesma pergunta no preparo IV já vem respondida.
    expect(screen.getByRole('radio', { name: 'Sim' })).toBeChecked();
    await choose(/Calcular cetofol/);

    expect(screen.getByText('Considere doses reduzidas (50%)')).toBeInTheDocument();
    await userEvent.type(weightField(), '70');
    const doses = document.querySelector<HTMLElement>('[data-slot="ketofol-doses"]');
    expect(doses).toHaveTextContent('Cetamina + Propofol18 mg de cada');
    expect(doses).toHaveTextContent('Volume da solução3,5 mL');
    expect(doses).toHaveTextContent('Dose9 mg de cada');
    expect(doses).toHaveTextContent('Volume1,8 mL');
  });

  it('o peso vale para todas as telas e fica na chave comum das ferramentas adultas', async () => {
    render(<SedacaoPage />);
    await choose(/^Combativo/);
    await userEvent.click(screen.getByRole('radio', { name: /^Cetamina IM/ }));
    await userEvent.type(weightField(), '80');
    expect(JSON.parse(window.sessionStorage.getItem(WEIGHT_KEY) ?? '{}')).toMatchObject({
      value: '80',
    });
    await choose(/^Preciso de sedação IV adicional/);
    await choose(/Calcular cetofol/);
    expect(weightField()).toHaveValue('80');
    expect(screen.getByText('Dose padrão')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="ketofol-doses"]')).toHaveTextContent(
      'Cetamina + Propofol40 mg de cada',
    );
  });

  it('peso fora da faixa adulta não calcula', async () => {
    render(<SedacaoPage />);
    await choose(/^Combativo/);
    await userEvent.click(screen.getByRole('radio', { name: /^Cetamina IM/ }));
    await userEvent.type(weightField(), '250');
    expect(screen.getByText('Fora da faixa aceita: 40 a 200 kg.')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="ketamine-dose"]')).toBeNull();
    expect(screen.getByText('Informe o peso para calcular a dose.')).toBeInTheDocument();
  });

  it('red flag marcado mostra o alerta dele', async () => {
    render(<SedacaoPage />);
    await choose(/^Pouco colaborativo/);
    await choose(/^Urgente — preciso agora/);
    await choose(/^Sim — tem acesso IV/);
    expect(screen.queryByText('Alto risco de broncoaspiração')).toBeNull();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Trauma + suspeita de intoxicação' }),
    );
    expect(screen.getByText('Alto risco de broncoaspiração')).toBeInTheDocument();
    expect(screen.getByText('Considere IOT programada antes da sedação:')).toBeInTheDocument();
  });

  it('"Voltar" volta para a tela anterior e leva o foco ao título', async () => {
    render(<SedacaoPage />);
    await choose(/^Combativo/);
    expect(heading()).toHaveFocus();
    expect(
      within(screen.getByRole('navigation', { name: 'Caminho no roteiro' })).getByText('Combativo'),
    ).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(heading()).toHaveTextContent('Avaliação inicial');
    expect(heading()).toHaveFocus();
  });

  it('o roteiro sobrevive a sair e voltar na aba; "Novo paciente" limpa tudo', async () => {
    const { unmount } = render(<SedacaoPage />);
    await choose(/^Combativo/);
    await userEvent.click(screen.getByRole('radio', { name: /^Cetamina IM/ }));
    await userEvent.type(weightField(), '70');
    unmount();

    render(<SedacaoPage />);
    expect(heading()).toHaveTextContent('Combativo / Agitação grave');
    expect(screen.getByRole('radio', { name: /^Cetamina IM/ })).toBeChecked();
    expect(weightField()).toHaveValue('70');

    await userEvent.click(screen.getByRole('button', { name: 'Novo paciente' }));
    expect(heading()).toHaveTextContent('Avaliação inicial');
    expect(JSON.parse(window.sessionStorage.getItem(STATE_KEY) ?? '{}').value.path).toEqual([
      'triagem',
    ]);
    expect(JSON.parse(window.sessionStorage.getItem(WEIGHT_KEY) ?? '{}').value).toBe('');
  });

  it('copia para o prontuário a conduta com a dose da tela', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SedacaoPage />);
    await choose(/^Combativo/);
    await userEvent.click(screen.getByRole('radio', { name: /^Cetamina IM/ }));
    await userEvent.type(weightField(), '70');
    await userEvent.click(screen.getByRole('button', { name: /Copiar para o prontuário/ }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- Contenção química: Cetamina 5 mg/kg IM: 350 mg (7,0 mL de 50 mg/mL)',
      ),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });
});
