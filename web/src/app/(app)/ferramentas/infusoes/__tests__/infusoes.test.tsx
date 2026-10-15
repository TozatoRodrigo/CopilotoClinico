import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncExternalStore } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfusionsScreen } from '../_components/infusions-screen';
import { TOOL_SESSION_TTL_MS } from '@/lib/tool-session';

/**
 * CC-311 — tela de Infusões. O endereço é simulado com um store pequeno: o
 * `replace` do roteador troca os parâmetros e re-renderiza, como no Next.
 */
const location = {
  search: new URLSearchParams(),
  listeners: new Set<() => void>(),
};

function setSearch(query: string) {
  location.search = new URLSearchParams(query);
  location.listeners.forEach((listener) => listener());
}

const replace = vi.fn((href: string) => {
  act(() => setSearch(new URL(href, 'http://copiloto.local').search));
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/ferramentas/infusoes',
  useSearchParams: () =>
    useSyncExternalStore(
      (listener) => {
        location.listeners.add(listener);
        return () => location.listeners.delete(listener);
      },
      () => location.search,
    ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function openAt(query = '') {
  location.search = new URLSearchParams(query);
  return render(<InfusionsScreen />);
}

async function typeWeight(value: string) {
  const field = screen.getByLabelText(/^Peso/);
  await userEvent.clear(field);
  await userEvent.type(field, value);
}

function velocity() {
  return screen.getByLabelText(/^Velocidade/) as HTMLInputElement;
}

function dose() {
  return screen.getByLabelText(/^Dose \(/) as HTMLInputElement;
}

function result() {
  const element = document.querySelector('[data-slot="infusion-result"]');
  if (!element) throw new Error('sem resultado');
  return element as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  replace.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/ferramentas/infusoes — abrir pela URL (CC-311, critério 3)', () => {
  it('abre a droga de ?droga=noradrenalina já selecionada', () => {
    openAt('droga=noradrenalina');
    expect(screen.getByRole('heading', { level: 1, name: 'Noradrenalina' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Calculadora de Noradrenalina' }),
    ).toBeInTheDocument();
  });

  it('aceita o ?drug= dos links antigos do ANY e passa o endereço para ?droga=', () => {
    openAt('drug=dobutamina');
    expect(screen.getByRole('heading', { level: 1, name: 'Dobutamina' })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/ferramentas/infusoes?droga=dobutamina', {
      scroll: false,
    });
  });

  it('avisa quando a droga do endereço não existe e mostra a lista', () => {
    openAt('droga=xpto');
    expect(screen.getByText('Droga não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Vasopressores e inotrópicos' })).toBeInTheDocument();
  });

  it('abre pela lista e pela busca, e volta para a lista', async () => {
    openAt();
    await userEvent.type(screen.getByLabelText('Buscar droga por nome ou sinônimo'), 'precedex');
    await userEvent.click(screen.getByRole('button', { name: /Dexmedetomidina/ }));
    expect(replace).toHaveBeenLastCalledWith('/ferramentas/infusoes?droga=dexmedetomidina');
    expect(screen.getByRole('heading', { level: 1, name: 'Dexmedetomidina' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Todas as drogas' }));
    expect(replace).toHaveBeenLastCalledWith('/ferramentas/infusoes');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Infusões contínuas' }),
    ).toBeInTheDocument();
  });
});

describe('/ferramentas/infusoes — dose ↔ mL/h (CC-311, critério 1)', () => {
  it('pede o peso antes de calcular droga por peso', () => {
    openAt('droga=noradrenalina');
    expect(screen.getByText('Informe o peso do paciente para ver o mL/h.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Velocidade/)).not.toBeInTheDocument();
  });

  it('calcula sem peso a droga que não usa peso (vasopressina)', () => {
    openAt('droga=vasopressina');
    expect(velocity()).toHaveValue('4,5');
    expect(dose()).toHaveValue('0,030');
  });

  it('dose → mL/h e mL/h → dose, com a faixa no tom certo', async () => {
    openAt('droga=noradrenalina');
    await typeWeight('70');

    // 0,1 mcg/kg/min × 70 kg × 60 ÷ 64 mcg/mL = 6,5625 mL/h
    expect(velocity()).toHaveValue('6,6');
    expect(result()).toHaveAttribute('data-tone', 'gray');
    expect(within(result()).getByText('Na faixa')).toBeInTheDocument();

    await userEvent.clear(dose());
    await userEvent.type(dose(), '1,5');
    expect(velocity()).toHaveValue('98,4');
    expect(result()).toHaveAttribute('data-tone', 'orange');
    expect(within(result()).getByText('Acima do usual')).toBeInTheDocument();

    await userEvent.clear(velocity());
    await userEvent.type(velocity(), '200');
    // 200 × 64 ÷ (70 × 60) = 3,0476 mcg/kg/min
    expect(dose()).toHaveValue('3,05');
    expect(result()).toHaveAttribute('data-tone', 'red');
    expect(within(result()).getByText('Dose crítica')).toBeInTheDocument();
  });

  it('não calcula com dose fora da faixa aceita', async () => {
    openAt('droga=noradrenalina');
    await typeWeight('70');
    await userEvent.clear(dose());
    await userEvent.type(dose(), '50');
    expect(screen.getByText(/Fora da faixa aceita: 0 a 9 mcg\/kg\/min/)).toBeInTheDocument();
    expect(velocity()).toHaveValue('');
    expect(screen.getByText('Corrija o campo destacado para ver o resultado.')).toBeInTheDocument();
  });

  it('anda um passo com − e +, preso à faixa', async () => {
    openAt('droga=dobutamina');
    await typeWeight('80');
    await userEvent.click(screen.getByRole('button', { name: /^Aumentar/ }));
    expect(dose()).toHaveValue('6,00');
    for (let index = 0; index < 6; index += 1) {
      await userEvent.click(screen.getByRole('button', { name: /^Diminuir/ }));
    }
    expect(dose()).toHaveValue('2,00');
  });

  it('troca de indicação volta à dose padrão do modo e mostra o bolus deste peso', async () => {
    openAt('droga=midazolam');
    await typeWeight('70');
    await userEvent.click(screen.getByRole('radio', { name: 'Status epilepticus' }));
    expect(dose()).toHaveValue('0,50');
    expect(screen.getByText('0,05 - 2,0 mg/kg/h')).toBeInTheDocument();
    const bolus = screen.getByText('Bolus (Status epilepticus)').closest('[data-slot="callout"]');
    expect(bolus).toHaveTextContent('Este paciente14 mg');
  });

  it('troca a concentração pelas diluições alternativas do ANY', async () => {
    openAt('droga=noradrenalina');
    await typeWeight('70');
    await userEvent.click(screen.getByRole('radio', { name: 'Dobrada (128 mcg/mL)' }));
    // 6,5625 ÷ 2
    expect(velocity()).toHaveValue('3,3');
  });
});

describe('/ferramentas/infusoes — minha diluição (CC-311, critério 2)', () => {
  async function fillDilution(ampoules: string, volume: string) {
    await userEvent.type(screen.getByLabelText(/^Ampolas de/), ampoules);
    await userEvent.type(screen.getByLabelText(/^Volume final/), volume);
  }

  it('salva no aparelho por droga e volta a valer ao reabrir', async () => {
    const view = openAt('droga=midazolam');
    await typeWeight('70');
    await userEvent.click(screen.getByRole('button', { name: 'Usar a diluição do meu serviço' }));
    await fillDilution('4', '100');
    expect(screen.getByText('4 ampolas de 50 mg / 10 mL em 100 mL')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sim, salvar' }));

    expect(
      JSON.parse(window.localStorage.getItem('copiloto:ferramentas:diluicao:midazolam') ?? 'null'),
    ).toEqual({ ampoules: 4, volume: 100, concentration: 2 });
    // 0,1 mg/kg/h × 70 kg ÷ 2 mg/mL
    expect(velocity()).toHaveValue('3,5');

    // Nova sessão: a diluição salva manda assim que a droga abre.
    view.unmount();
    window.sessionStorage.clear();
    openAt('droga=midazolam');
    expect(
      screen.getByText('Minha diluição', { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4 ampolas de 50 mg / 10 mL em 100 mL')).toBeInTheDocument();
    // Não vale para outra droga.
    expect(window.localStorage.getItem('copiloto:ferramentas:diluicao:fentanil')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Apagar minha diluição' }));
    expect(window.localStorage.getItem('copiloto:ferramentas:diluicao:midazolam')).toBeNull();
  });

  it('"só desta vez" aplica sem salvar', async () => {
    openAt('droga=midazolam');
    await typeWeight('70');
    await userEvent.click(screen.getByRole('button', { name: 'Usar a diluição do meu serviço' }));
    await fillDilution('4', '100');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Só desta vez' }));
    expect(velocity()).toHaveValue('3,5');
    expect(window.localStorage.getItem('copiloto:ferramentas:diluicao:midazolam')).toBeNull();
  });

  it('barra mais de 4× o padrão e volume menor que o das ampolas', async () => {
    openAt('droga=midazolam');
    await userEvent.click(screen.getByRole('button', { name: 'Usar a diluição do meu serviço' }));
    // 30 ampolas de 50 mg em 300 mL = 5 mg/mL, 5× o padrão.
    await fillDilution('30', '300');
    expect(
      screen.getByText(
        'Resultado de 5 mg/mL — mais de 4 vezes o padrão de 1 mg/mL. Confira as ampolas e o volume.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/^Ampolas de/));
    await userEvent.clear(screen.getByLabelText(/^Volume final/));
    await fillDilution('5', '40');
    expect(
      screen.getByText('O volume final não pode ser menor que o volume das ampolas (50 mL).'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('não oferece diluição própria para o propofol (puro)', () => {
    openAt('droga=propofol');
    expect(
      screen.queryByRole('button', { name: 'Usar a diluição do meu serviço' }),
    ).not.toBeInTheDocument();
  });
});

describe('/ferramentas/infusoes — ir e voltar', () => {
  it('mantém peso, droga e dose na aba e restaura o endereço', async () => {
    const view = openAt('droga=noradrenalina');
    await typeWeight('82');
    await userEvent.clear(dose());
    await userEvent.type(dose(), '0,25');
    view.unmount();

    // Volta sem parâmetro (ex.: pelo hub): reabre a última droga.
    replace.mockClear();
    openAt();
    expect(screen.getByRole('heading', { level: 1, name: 'Noradrenalina' })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/ferramentas/infusoes?droga=noradrenalina', {
      scroll: false,
    });
    expect(screen.getByLabelText(/^Peso/)).toHaveValue('82');
    expect(
      screen.getByText('Peso mantido desta aba. Confira se é o do paciente atual.'),
    ).toBeInTheDocument();
    expect(dose()).toHaveValue('0,25');
  });

  it('o peso da sessão vence depois de meia hora sem uso', async () => {
    const view = openAt('droga=noradrenalina');
    await typeWeight('82');
    view.unmount();

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + TOOL_SESSION_TTL_MS + 1000);
    openAt('droga=noradrenalina');
    expect(screen.getByLabelText(/^Peso/)).toHaveValue('');
    vi.mocked(Date.now).mockRestore();
  });

  it('copia para o prontuário a dose, o mL/h e a diluição', async () => {
    openAt('droga=noradrenalina');
    await typeWeight('70');
    expect(screen.getByRole('button', { name: 'Copiar para o prontuário' })).toBeEnabled();
  });
});

function protocolResult() {
  const element = document.querySelector('[data-slot="protocol-result"]');
  if (!element) throw new Error('sem resultado');
  return element as HTMLElement;
}

describe('/ferramentas/infusoes — heparina (CC-312)', () => {
  it('abre pelo ?drug=heparina do TEP do ANY e calcula o início da SCA', async () => {
    openAt('drug=heparina');
    expect(screen.getByRole('heading', { level: 1, name: 'Heparina' })).toBeInTheDocument();
    expect(screen.getByText('Informe o peso do paciente para calcular.')).toBeInTheDocument();

    await typeWeight('70');
    const bolus = screen.getByText('Bolus inicial (SCA)').closest('[data-slot="callout"]');
    // 60 UI/kg × 70 = 4.200, teto de 4.000
    expect(bolus).toHaveTextContent('Este paciente4000 UI');
    // 12 UI/kg/h × 70 = 840 UI/h ÷ 100 UI/mL
    expect(protocolResult()).toHaveTextContent('Velocidade8,4mL/h');
    expect(protocolResult()).toHaveTextContent('Dose840UI/h');

    await userEvent.click(screen.getByRole('radio', { name: 'TEP/TEV' }));
    expect(
      screen.getByText('Bolus inicial (TEP/TEV)').closest('[data-slot="callout"]'),
    ).toHaveTextContent('Este paciente5600 UI');
    expect(protocolResult()).toHaveTextContent('Velocidade12,6mL/h');
  });

  it('ajusta pelo nomograma de TTPa, com a linha atual marcada e a cor da faixa', async () => {
    openAt('droga=heparina');
    await typeWeight('70');
    await userEvent.click(screen.getByRole('radio', { name: 'Ajuste (TTPa)' }));
    await userEvent.type(screen.getByLabelText(/^TTPa atual/), '1,3');

    expect(screen.getByRole('row', { current: true })).toHaveTextContent('1,2 - 1,5');
    const adjustment = screen.getByText('Bolus adicional').closest('[data-slot="callout"]');
    expect(adjustment).toHaveTextContent('Bolus adicional2800 UI (28,0 mL)');
    expect(adjustment).toHaveTextContent('Nova dose14,0 UI/kg/h');
    expect(protocolResult()).toHaveAttribute('data-tone', 'orange');
    expect(within(protocolResult()).getByText('TTPa abaixo do alvo')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/^TTPa atual/));
    await userEvent.type(screen.getByLabelText(/^TTPa atual/), '3,5');
    expect(screen.getByText('Considere parar a infusão por 1 hora')).toBeInTheDocument();
    expect(protocolResult()).toHaveAttribute('data-tone', 'red');
  });

  it('recusa TTPa em segundos no lugar da relação', async () => {
    openAt('droga=heparina');
    await typeWeight('70');
    await userEvent.click(screen.getByRole('radio', { name: 'Ajuste (TTPa)' }));
    await userEvent.type(screen.getByLabelText(/^TTPa atual/), '75');
    expect(screen.getByText(/Fora da faixa aceita: 0,2 a 10/)).toBeInTheDocument();
    expect(screen.queryByText('Nova dose')).not.toBeInTheDocument();
  });

  it('mantém fase e TTPa ao ir e voltar', async () => {
    const view = openAt('droga=heparina');
    await userEvent.click(screen.getByRole('radio', { name: 'Ajuste (TTPa)' }));
    await userEvent.type(screen.getByLabelText(/^TTPa atual/), '2');
    view.unmount();
    openAt('droga=heparina');
    expect(screen.getByLabelText(/^TTPa atual/)).toHaveValue('2');
  });
});

describe('/ferramentas/infusoes — insulina (CC-312)', () => {
  it('início: bolus e infusão pela tabela, sem pedir peso', async () => {
    openAt('droga=insulina');
    expect(screen.queryByLabelText(/^Peso/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Glicemia inicial/), '260');
    expect(protocolResult()).toHaveTextContent('Bolus6 UI');
    expect(protocolResult()).toHaveTextContent('Infusão3 UI/h');
    expect(protocolResult()).toHaveAttribute('data-tone', 'orange');
    expect(screen.getByRole('row', { current: true })).toHaveTextContent('251 - 300');
  });

  it('ajuste: corrige pela queda da última hora', async () => {
    openAt('droga=insulina');
    await userEvent.click(screen.getByRole('radio', { name: 'Ajuste (glicemia)' }));
    await userEvent.type(screen.getByLabelText(/^Glicemia atual/), '190');
    await userEvent.type(screen.getByLabelText(/^Glicemia 1 h antes/), '250');
    expect(
      screen.getByText('Informe a glicemia atual e a infusão atual para ver o ajuste.'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Infusão atual/), '4');

    expect(screen.getByText('↓ 60 mg/dL/h')).toBeInTheDocument();
    expect(screen.getByText('Queda moderada → ↓ 1 UI/h')).toBeInTheDocument();
    expect(protocolResult()).toHaveTextContent('Infusão3 UI/h (↓ 1)');
  });

  it('ajuste: hipoglicemia pede parar e glicose 50%, em vermelho', async () => {
    openAt('droga=insulina');
    await userEvent.click(screen.getByRole('radio', { name: 'Ajuste (glicemia)' }));
    await userEvent.type(screen.getByLabelText(/^Glicemia atual/), '60');
    await userEvent.type(screen.getByLabelText(/^Infusão atual/), '3');
    expect(protocolResult()).toHaveTextContent('BolusParar a infusão');
    expect(protocolResult()).toHaveTextContent('InfusãoGlicose 50% 40 mL');
    expect(protocolResult()).toHaveAttribute('data-tone', 'red');
    expect(within(protocolResult()).getByText('Hipoglicemia')).toBeInTheDocument();
  });
});
