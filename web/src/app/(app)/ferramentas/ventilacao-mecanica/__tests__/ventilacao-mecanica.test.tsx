import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VentilacaoMecanicaPage from '../page';
import { HACOR_SESSION_TTL_MS } from '@/lib/tool-session';
import { readHacorSession } from '../_components/hacor-state';

const HACOR_STORAGE_KEY = 'copiloto:ferramentas:sessao:vm-hacor';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function renderPage() {
  return render(<VentilacaoMecanicaPage />);
}

/** Abre a conta pelo título (cada conta é um "toggle" fechado). */
async function open(name: string) {
  await userEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('region', { name: `Resultado: ${name}` });
}

async function type(label: RegExp, value: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, value);
}

async function answer(legend: string, option: string) {
  const group = screen.getByRole('group', { name: legend });
  await userEvent.click(within(group).getByRole('radio', { name: new RegExp(`^${option}`) }));
}

describe('/ferramentas/ventilacao-mecanica — contas (CC-327)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o aviso fixo, os atalhos de seção e as 14 contas fechadas', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ventilação mecânica' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    const nav = screen.getByRole('navigation', { name: 'Seções da ventilação mecânica' });
    expect(within(nav).getByRole('link', { name: 'HACOR' })).toHaveAttribute('href', '#vm-hacor');
    expect(screen.getByRole('button', { name: 'Índice ROX' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('calcula ao vivo, com vírgula, unidade e faixa no tom', async () => {
    renderPage();
    const result = await open('Resistência de vias aéreas (Rva)');

    expect(within(result).getByRole('status')).toHaveTextContent('Faltam 3 respostas');
    await type(/^Pressão de pico/, '30');
    await type(/^Pressão de platô/, '20');
    await type(/^Fluxo inspiratório/, '36');

    const status = within(result).getByRole('status');
    expect(status).toHaveTextContent('16,7cmH₂O/L/s');
    expect(status).toHaveTextContent('Elevada');
    expect(status).toHaveTextContent('Considere broncoespasmo, secreções ou tubo.');
    expect(status).toHaveAttribute('data-tone', 'orange');
  });

  it('avisa fora da faixa habitual do ANY sem barrar a conta', async () => {
    renderPage();
    const result = await open('Resistência de vias aéreas (Rva)');

    await type(/^Pressão de pico/, '70');
    await type(/^Pressão de platô/, '20');
    await type(/^Fluxo inspiratório/, '60');

    expect(screen.getByText('Valor fora da faixa habitual (5-60 cmH₂O).')).toBeInTheDocument();
    expect(within(result).getByRole('status')).toHaveTextContent('50,0cmH₂O/L/s');
  });

  it('fora da faixa aceita é erro e não calcula', async () => {
    renderPage();
    const result = await open('Resistência de vias aéreas (Rva)');

    await type(/^Pressão de pico/, '150');
    await type(/^Pressão de platô/, '20');
    await type(/^Fluxo inspiratório/, '60');

    expect(screen.getByText('Fora da faixa aceita: 1 a 100 cmH₂O.')).toBeInTheDocument();
    expect(within(result).getByRole('status')).toHaveTextContent(
      'Corrija o campo destacado para ver o resultado.',
    );
  });

  it('não calcula com platô abaixo da PEEP', async () => {
    renderPage();
    const result = await open('Complacência estática (Cst)');

    await type(/^Volume corrente/, '400');
    await type(/^Pressão de platô/, '8');
    await type(/^PEEP/, '10');

    expect(within(result).getByRole('status')).toHaveTextContent(
      'A pressão de platô precisa ser maior que a PEEP.',
    );
  });

  it('peso predito pelo sexo e altura, com o volume corrente por mL/kg', async () => {
    renderPage();
    const result = await open('Peso predito (ARDSNet)');

    await type(/^Altura/, '160');
    expect(within(result).getByRole('status')).toHaveTextContent('Falta 1 resposta: Sexo.');
    await answer('Sexo', 'Feminino');

    const status = within(result).getByRole('status');
    expect(status).toHaveTextContent('Peso predito');
    expect(status).toHaveTextContent('52,4kg');
    expect(status).toHaveTextContent('VC 6 mL/kg: 314 mL');
    expect(status).toHaveAttribute('data-tone', 'gray');
  });

  it('lê a FiO₂ em porcentagem na P/F', async () => {
    renderPage();
    const result = await open('Relação P/F (PaO₂/FiO₂)');

    await type(/^PaO₂/, '80');
    await type(/^FiO₂/, '40');

    const status = within(result).getByRole('status');
    expect(status).toHaveTextContent('200');
    expect(status).toHaveTextContent('SDRA moderada (P/F 100-199)');
  });

  it('copia para o prontuário e guarda as respostas ao fechar e reabrir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderPage();
    const result = await open('Índice de assincronia');

    await type(/^Eventos de assincronia/, '3');
    await type(/^Frequência total/, '20');
    await userEvent.click(within(result).getByRole('button', { name: 'Copiar para o prontuário' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('IA: 15,0% — Elevado (>10%).'));

    await userEvent.click(screen.getByRole('button', { name: 'Índice de assincronia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Índice de assincronia' }));
    expect(screen.getByLabelText(/^Eventos de assincronia/)).toHaveValue('3');
  });

  it('não mostra o atalho para a via aérea enquanto ela estiver "em breve"', async () => {
    renderPage();
    const result = await open('Índice ROX');

    await type(/^SpO₂/, '94');
    await type(/^FiO₂/, '50');
    await type(/^Frequência respiratória/, '22');

    expect(within(result).getByRole('status')).toHaveTextContent('Alto risco de falha');
    expect(within(result).queryByRole('link')).not.toBeInTheDocument();
  });

  it('mostra os critérios de SDRA (Global 2024)', () => {
    renderPage();
    const sdra = screen.getByRole('region', { name: 'Critérios de SDRA (Global 2024)' });
    const rows = within(sdra).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'GravidadeP/F (PEEP ≥ 5)S/F (SpO₂ ≤ 97%)',
      'Leve200-300235-315',
      'Moderada100-199148-234',
      'Grave<100<148',
    ]);
  });
});

describe('/ferramentas/ventilacao-mecanica — HACOR com reavaliação (CC-327)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  async function answerHacor(options: Record<string, string>) {
    for (const [legend, option] of Object.entries(options)) await answer(legend, option);
  }

  const HIGH_RISK = {
    'FC ≥ 120 bpm': 'Sim',
    pH: '7,30-7,34',
    'Glasgow (GCS)': '13-14',
    'PaO₂/FiO₂': '151-175',
    'Frequência respiratória (irpm)': '31-35',
  };

  const LOW_RISK = {
    'FC ≥ 120 bpm': 'Não',
    pH: '≥ 7,35',
    'Glasgow (GCS)': '15',
    'PaO₂/FiO₂': '176-200',
    'Frequência respiratória (irpm)': '31-35',
  };

  it('avalia antes da VNI, registra o T0 e compara na reavaliação', async () => {
    renderPage();
    const hacor = screen.getByRole('region', { name: 'HACOR (falha de VNI)' });
    await userEvent.click(within(hacor).getByRole('radio', { name: /Iniciar VNI/ }));
    await answerHacor(HIGH_RISK);

    const result = within(hacor).getByRole('status');
    expect(result).toHaveTextContent('9 pontos');
    expect(result).toHaveTextContent('Alto risco de falha');
    expect(result).toHaveTextContent('Considere preparar o material de IOT e reavaliar em 1 h.');
    expect(result).toHaveAttribute('data-tone', 'red');

    await userEvent.click(
      within(hacor).getByRole('button', { name: 'Iniciar VNI e registrar T0' }),
    );
    expect(within(hacor).getByRole('radio', { name: /Reavaliar VNI/ })).toBeChecked();
    expect(within(hacor).getAllByText('HACOR 9 — alto risco').length).toBeGreaterThan(0);

    await answerHacor(LOW_RISK);
    const again = within(hacor).getByRole('status');
    expect(again).toHaveTextContent('3 pontos');
    expect(again).toHaveTextContent('Considere manter a VNI com reavaliação padrão.');
    expect(again).toHaveTextContent('Anterior: 9 → Atual: 3 (melhora)');

    await userEvent.click(within(hacor).getByRole('button', { name: 'Salvar e reavaliar depois' }));
    const history = within(hacor).getByRole('region', { name: 'Histórico de avaliações' });
    expect(
      within(history)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/^T0 \(\d\d:\d\d\)HACOR 9 — alto risco$/),
      expect.stringMatching(/^T1h \(\d\d:\d\d\)HACOR 3 — baixo risco$/),
    ]);
    expect(history).toHaveTextContent('Tendência: 9 → 3 (melhora)');
  });

  it('guarda o histórico na aba ao sair e voltar', async () => {
    const first = renderPage();
    const hacor = screen.getByRole('region', { name: 'HACOR (falha de VNI)' });
    await userEvent.click(within(hacor).getByRole('radio', { name: /Iniciar VNI/ }));
    await answerHacor(HIGH_RISK);
    await userEvent.click(
      within(hacor).getByRole('button', { name: 'Iniciar VNI e registrar T0' }),
    );
    first.unmount();

    renderPage();
    const back = screen.getByRole('region', { name: 'HACOR (falha de VNI)' });
    expect(within(back).getAllByText('HACOR 9 — alto risco').length).toBeGreaterThan(0);

    await userEvent.click(within(back).getByRole('button', { name: 'Nova avaliação inicial' }));
    expect(within(back).queryByText('HACOR 9 — alto risco')).not.toBeInTheDocument();
  });

  it('descarta o histórico vencido ou adulterado', () => {
    const now = Date.now();
    const valid = { phase: 'reavaliacao', start: {}, reassessment: {}, history: [] };
    window.sessionStorage.setItem(
      HACOR_STORAGE_KEY,
      JSON.stringify({ savedAt: now - HACOR_SESSION_TTL_MS - 1, value: valid }),
    );
    expect(readHacorSession(now)).toBeNull();

    window.sessionStorage.setItem(
      HACOR_STORAGE_KEY,
      JSON.stringify({ savedAt: now, value: { ...valid, history: [{ label: 'T0' }] } }),
    );
    expect(readHacorSession(now)).toBeNull();

    window.sessionStorage.setItem(
      HACOR_STORAGE_KEY,
      JSON.stringify({ savedAt: now, value: valid }),
    );
    expect(readHacorSession(now)).toEqual(valid);
  });
});
