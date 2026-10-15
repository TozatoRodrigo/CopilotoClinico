import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatClock } from '../../_components/shock/format-time';
import { SepticShockScreen } from '../_components/septic-shock-screen';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ferramentas/choque-septico',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

const SESSION_KEY = 'copiloto:ferramentas:sessao:choque-septico';
const WEIGHT_KEY = 'copiloto:ferramentas:sessao:peso-adulto';
const T0 = new Date(2026, 9, 15, 14, 0).getTime();

let clock = T0;
const now = () => clock;
const advance = (minutes: number) => {
  clock += minutes * 60_000;
};

function field(name: RegExp) {
  return screen.getByRole('textbox', { name });
}

async function answer(group: string, option: string) {
  await userEvent.click(within(screen.getByRole('group', { name: group })).getByLabelText(option));
}

/** Passo 1 com TEC 5,5 s e lactato 36 mg/dL, até o passo 2. */
async function startTier1() {
  await userEvent.type(field(/Lactato/), '36');
  await userEvent.type(field(/ou TEC medido/), '5,5');
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar Tier 1' }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  clock = T0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/ferramentas/choque-septico — roteiro (CC-316)', () => {
  it('abre no reconhecimento com o aviso fixo e o passo 1 de 5', () => {
    render(<SepticShockScreen now={now} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Choque séptico' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Apoio à decisão');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Reconhecimento do choque séptico' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
  });

  it('mostra o lactato nas duas unidades e acusa hipoperfusão com TEC > 3 s', async () => {
    render(<SepticShockScreen now={now} />);

    await userEvent.type(field(/Lactato/), '36');
    expect(screen.getByText('36,0 mg/dL = 4,0 mmol/L')).toBeInTheDocument();
    await answer('Unidade do lactato', 'mmol/L');
    expect(field(/Lactato/)).toHaveAccessibleName('Lactato (mmol/L)');

    await answer('TEC por faixa', 'Anormal > 3 s');
    expect(screen.getByText('Hipoperfusão presente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar Tier 1' })).toBeInTheDocument();
  });

  it('critério de aceite 1: completo os 5 passos e a linha do tempo mostra cada reavaliação com horário', async () => {
    render(<SepticShockScreen now={now} />);

    await startTier1();
    expect(screen.getByRole('heading', { level: 2, name: 'Avaliação de fluidos' })).toHaveFocus();

    advance(5);
    await userEvent.type(field(/Pressão de pulso/), '32');
    await answer('Responsivo a fluidos?', 'Sim');
    await userEvent.click(screen.getByRole('button', { name: 'Somar bolus de 500 mL' }));
    advance(30);
    const fluidsQuestion = screen.getByRole('group', { name: 'TEC normalizou após fluidos?' });
    await userEvent.click(within(fluidsQuestion).getByRole('button', { name: 'Não' }));
    advance(30);
    await userEvent.click(within(fluidsQuestion).getByRole('button', { name: 'Não' }));

    // 1000 mL: o "Não" leva ao vasopressor.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Vasopressor — titulação' }),
    ).toBeInTheDocument();
    await userEvent.type(field(/^PAD/), '45');
    await userEvent.type(field(/^FC/), '110');
    await userEvent.type(field(/Dose de noradrenalina/), '0,2');
    expect(screen.getByText('Hiporresponsividade grave')).toBeInTheDocument();
    advance(5);
    await userEvent.click(
      within(screen.getByRole('group', { name: 'TEC normalizou?' })).getByRole('button', {
        name: 'Não',
      }),
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Avaliação de perfusão' }),
    ).toBeInTheDocument();
    await userEvent.type(field(/SvcO2/), '62');
    await userEvent.type(field(/Gap CO2/), '8');
    expect(screen.getAllByText('Baixo débito cardíaco / estase')[0]).toBeInTheDocument();
    advance(10);
    await userEvent.click(screen.getByRole('button', { name: /Resumo/ }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Perfil hemodinâmico' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Choque séptico — componente vasoplégico')).toBeInTheDocument();

    for (const [minutes, value] of [
      [60, '4,2'],
      [60, '2,8'],
    ] as const) {
      advance(minutes);
      await userEvent.type(field(/Novo TEC/), value);
      await userEvent.click(screen.getByRole('button', { name: 'Salvar reavaliação' }));
    }

    const timeline = within(screen.getByRole('region', { name: 'Linha do tempo' })).getAllByRole(
      'listitem',
    );
    const rows = timeline.map((item) => item.textContent);
    expect(rows).toEqual([
      `${formatClock(T0)}Reconhecimento: TEC 5,5 s, Lactato 4,0 mmol/L`,
      `${formatClock(T0 + 5 * 60_000)}Bolus cristaloide 500 mL (total: 500 mL)`,
      `${formatClock(T0 + 35 * 60_000)}Bolus cristaloide 500 mL (total: 1000 mL)`,
      `${formatClock(T0 + 70 * 60_000)}Vasopressor: NE 0,20 mcg/kg/min, PAD 45, FC 110, VNERi 2,0`,
      `${formatClock(T0 + 80 * 60_000)}Perfusão: SvcO2 62%, Gap CO2 8,0 mmHg (Baixo débito cardíaco / estase)`,
      `${formatClock(T0 + 140 * 60_000)}Reavaliação TEC: 4,2s`,
      `${formatClock(T0 + 200 * 60_000)}Reavaliação TEC: 2,8s`,
    ]);
    // Cada reavaliação com o horário em <time>.
    const times = within(screen.getByRole('region', { name: 'Linha do tempo' })).getAllByText(
      (_, element) => element?.tagName === 'TIME',
    );
    expect(times.at(-1)).toHaveAttribute('datetime', new Date(T0 + 200 * 60_000).toISOString());
  });

  it('critério de aceite 2: "Calcular noradrenalina" abre Infusões com a droga e a volta cai no mesmo passo', async () => {
    const { unmount } = render(<SepticShockScreen now={now} />);
    await userEvent.type(field(/Peso estimado/), '72,5');
    await startTier1();
    await userEvent.click(screen.getByRole('button', { name: 'Passo 3' }));
    await userEvent.type(field(/^PAD/), '48');

    const link = screen.getByRole('link', { name: 'Calcular noradrenalina' });
    expect(link).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=noradrenalina&de=choque-septico',
    );
    expect(screen.getByRole('link', { name: 'Calcular vasopressina' })).toHaveAttribute(
      'href',
      '/ferramentas/infusoes?droga=vasopressina&de=choque-septico',
    );

    // Sair para as Infusões desmonta a tela; voltar monta de novo a partir da sessão.
    unmount();
    advance(3);
    render(<SepticShockScreen now={now} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Vasopressor — titulação' }),
    ).toBeInTheDocument();
    expect(field(/^PAD/)).toHaveValue('48');
    expect(screen.getByText('Vasoplegia provável')).toBeInTheDocument();
    expect(screen.getByText('Roteiro retomado nesta aba')).toBeInTheDocument();
    expect(screen.getByText('72,5 kg')).toBeInTheDocument();
  });

  it('o peso fica na mesma chave e formato das Infusões (sessão da aba)', async () => {
    render(<SepticShockScreen now={now} />);
    await userEvent.type(field(/Peso estimado/), '80');

    const stored = JSON.parse(window.sessionStorage.getItem(WEIGHT_KEY) ?? '{}');
    expect(stored).toMatchObject({ value: '80' });
    expect(typeof stored.savedAt).toBe('number');
  });

  it('começa do zero quando o roteiro salvo passou de 6 horas', () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        savedAt: Date.now() - 6 * 60 * 60 * 1000 - 1,
        value: { step: 'perfil', events: [] },
      }),
    );
    render(<SepticShockScreen now={now} />);

    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
    expect(screen.queryByText('Roteiro retomado nesta aba')).not.toBeInTheDocument();
  });

  it('"Recomeçar" no aviso de roteiro retomado volta ao passo 1', async () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ savedAt: Date.now(), value: { step: 'perfusao', events: [] } }),
    );
    render(<SepticShockScreen now={now} />);
    expect(screen.getByText('Passo 4 de 5 — Tier 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Recomeçar' }));

    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
    expect(screen.queryByText('Roteiro retomado nesta aba')).not.toBeInTheDocument();
  });

  it('PP ≥ 40 sugere seguir para o vasopressor sem bolus', async () => {
    render(<SepticShockScreen now={now} />);
    await startTier1();
    await userEvent.type(field(/Pressão de pulso/), '45');

    expect(
      screen.getByText('PP ≥ 40 mmHg — volume sistólico provavelmente adequado'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Responsivo a fluidos?' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vasopressor — Tier 1b' }));
    expect(screen.getByText('Passo 3 de 5 — Tier 1')).toBeInTheDocument();
  });
});
