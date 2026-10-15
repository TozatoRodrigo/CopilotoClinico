import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  byRule,
  requireValue,
  type FormulaCalculator,
  type ScoreCalculator,
} from '@clinical-tools/calculator';
import { CHADSVASC } from '@clinical-tools/calculators/chadsvasc';
import { SHOCK_INDEX } from '@clinical-tools/calculators/shock-index';
import { CalculatorView } from '../calculator-view';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

function answerAll(answers: Record<string, string>) {
  return Object.entries(answers).reduce(async (previous, [legend, option]) => {
    await previous;
    const group = screen.getByRole('group', { name: legend });
    await userEvent.click(within(group).getByRole('radio', { name: new RegExp(`^${option}`) }));
  }, Promise.resolve());
}

describe('CalculatorView — escore (CC-305/CC-306)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o resultado ao vivo, sem botão Calcular', async () => {
    render(<CalculatorView definition={CHADSVASC} />);

    expect(screen.queryByRole('button', { name: /calcular/i })).not.toBeInTheDocument();
    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('Faltam 7 respostas para ver o resultado.');

    await answerAll({
      'ICC / disfunção ventricular (C)': 'Não',
      'Hipertensão (H)': 'Sim',
      'Diabetes mellitus (D)': 'Não',
      'AVC / AIT / tromboembolismo prévio (S2)': 'Não',
      'Doença vascular (IAM prévio, DAP, placa aórtica) (V)': 'Não',
      'Idade (A / A2)': '65–74 anos',
    });
    expect(result).toHaveTextContent('Falta 1 resposta: Sexo feminino (Sc).');

    await answerAll({ 'Sexo feminino (Sc)': 'Não' });
    expect(result).toHaveTextContent('2 pontos');
    expect(result).toHaveTextContent('Risco moderado');
    expect(result).toHaveTextContent('Anticoagulação oral recomendada.');
    // Laranja = muda a conduta (ADR-017: amarelo do ANY vira laranja).
    expect(result).toHaveAttribute('data-tone', 'orange');
  });

  it('copia o texto do prontuário só quando há resultado', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<CalculatorView definition={CHADSVASC} />);

    const copy = screen.getByRole('button', { name: 'Copiar para o prontuário' });
    expect(copy).toBeDisabled();

    await answerAll({
      'ICC / disfunção ventricular (C)': 'Não',
      'Hipertensão (H)': 'Não',
      'Diabetes mellitus (D)': 'Não',
      'AVC / AIT / tromboembolismo prévio (S2)': 'Não',
      'Doença vascular (IAM prévio, DAP, placa aórtica) (V)': 'Não',
      'Idade (A / A2)': '< 65 anos',
      'Sexo feminino (Sc)': 'Não',
    });
    await userEvent.click(copy);

    expect(writeText).toHaveBeenCalledTimes(1);
    const note = writeText.mock.calls[0]?.[0] as string;
    expect(note.split('\n')[0]).toBe('CHA2DS2-VASc: 0 pontos — Baixo risco.');
    expect(note).toContain('Referência: Lip GY et al.');
  });

  it('mostra o texto selecionável quando o navegador nega a área de transferência', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<CalculatorView definition={SHOCK_INDEX} />);

    await userEvent.type(screen.getByRole('textbox', { name: /Frequência cardíaca/ }), '110');
    await userEvent.type(screen.getByRole('textbox', { name: /Pressão arterial sistólica/ }), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Copiar para o prontuário' }));

    const fallback = await screen.findByRole('textbox', { name: /Selecione o texto e copie/ });
    expect((fallback as HTMLTextAreaElement).value).toContain(
      'Índice de choque: 1,22 — Choque provável.',
    );
  });
});

describe('CalculatorView — fórmula', () => {
  it('calcula com vírgula e nunca com valor fora da faixa', async () => {
    render(<CalculatorView definition={SHOCK_INDEX} />);
    const heartRate = screen.getByRole('textbox', { name: /Frequência cardíaca/ });
    const systolic = screen.getByRole('textbox', { name: /Pressão arterial sistólica/ });
    const result = screen.getByRole('status');

    await userEvent.type(heartRate, '72');
    await userEvent.type(systolic, '120,0');
    expect(result).toHaveTextContent('0,60');
    expect(result).toHaveTextContent('Normal');
    expect(result).toHaveAttribute('data-tone', 'gray');

    await userEvent.clear(systolic);
    await userEvent.type(systolic, '301');
    expect(systolic).toBeInvalid();
    expect(result).toHaveAttribute('data-state', 'pending');
    expect(result).toHaveTextContent('Corrija o campo destacado para ver o resultado.');
    expect(result).not.toHaveTextContent('0,');
  });

  it('limpa as respostas', async () => {
    render(<CalculatorView definition={SHOCK_INDEX} />);
    const heartRate = screen.getByRole('textbox', { name: /Frequência cardíaca/ });
    const clear = screen.getByRole('button', { name: 'Limpar respostas' });
    expect(clear).toBeDisabled();

    await userEvent.type(heartRate, '130');
    await userEvent.click(clear);

    expect(screen.getByRole('textbox', { name: /Frequência cardíaca/ })).toHaveValue('');
  });

  it('mostra o aviso fixo, a referência fechada e a procedência', async () => {
    render(<CalculatorView definition={SHOCK_INDEX} />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'Apoio à decisão; não substitui o julgamento clínico.',
    );
    expect(screen.queryByRole('heading', { name: 'Pérolas e armadilhas' })).not.toBeInTheDocument();
    expect(screen.getByText(/revisão clínica pendente/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /Por que usar, quando usar e referência/ }),
    );

    for (const heading of ['Por que usar', 'Quando usar', 'Pérolas e armadilhas', 'Referência']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(SHOCK_INDEX.reference.citation)).toBeInTheDocument();
  });
});

const PROVENANCE = {
  source: 'teste',
  version: '1.0.0',
  updatedAt: '2026-10-14',
  review: { status: 'pendente' as const },
};
const REFERENCE = { why: 'w', whenToUse: 'q', pearlsPitfalls: ['p'], citation: 'c' };

/** Fórmula com o que o CC-306 trouxe: campo já preenchido, parâmetro, detalhe e aviso de versão. */
const CLEARANCE: FormulaCalculator = {
  kind: 'formula',
  id: 'teste-clearance',
  name: 'Clearance de teste',
  aliases: [],
  category: 'Teste',
  description: '',
  reference: REFERENCE,
  provenance: PROVENANCE,
  versionNotice: { title: 'Versão simplificada', text: 'Estimativa rápida, não o escore oficial.' },
  inputs: [
    { id: 'peso', label: 'Peso', unit: 'kg', min: 30, max: 250, step: 0.5 },
    { id: 'fator', label: 'Fator', unit: '', min: 0.4, max: 0.6, step: 0.05, defaultValue: 0.6 },
  ],
  items: [
    {
      id: 'sexo',
      label: 'Sexo',
      role: 'parameter',
      options: [
        { id: 'm', label: 'Masculino', points: 1 },
        { id: 'f', label: 'Feminino', points: 0.85 },
      ],
    },
  ],
  decimals: 1,
  unit: 'L',
  compute: (values) =>
    Math.round(
      requireValue(values, 'peso') *
        requireValue(values, 'fator') *
        requireValue(values, 'sexo') *
        10,
    ) / 10,
  check: (values) =>
    requireValue(values, 'peso') > 200 ? { inputId: 'peso', message: 'Confira o peso.' } : null,
  details: (value) => [{ label: 'Metade', value: `${value / 2} L` }],
  interpretation: {
    bands: [],
    otherwise: { id: 'unica', label: 'Água corporal', tone: 'neutral', action: 'Sugestão.' },
  },
};

/** Faixa por regra e sem número: a forma do CAM-ICU. */
const RULE: ScoreCalculator = {
  kind: 'score',
  id: 'teste-regra',
  name: 'Regra de teste',
  aliases: [],
  category: 'Teste',
  description: '',
  reference: REFERENCE,
  provenance: PROVENANCE,
  items: [
    {
      id: 'f1',
      label: 'Achado 1',
      options: [
        { id: 'ausente', label: 'Ausente', points: 0 },
        { id: 'presente', label: 'Presente', points: 1 },
      ],
    },
  ],
  formatValue: () => null,
  interpretation: byRule(
    [
      {
        id: 'positivo',
        label: 'Teste positivo',
        tone: 'critical',
        action: 'Considere investigar.',
      },
      { id: 'negativo', label: 'Teste negativo', tone: 'neutral', action: 'Reavalie amanhã.' },
    ],
    (_value, values) => (values.f1 === 1 ? 'positivo' : 'negativo'),
  ),
};

describe('CalculatorView — o que o CC-306 trouxe para as 75', () => {
  it('abre com o valor padrão preenchido e o "Limpar" volta a ele', async () => {
    render(<CalculatorView definition={CLEARANCE} />);
    const factor = screen.getByRole('textbox', { name: 'Fator' });
    const clear = screen.getByRole('button', { name: 'Limpar respostas' });

    expect(factor).toHaveValue('0,6');
    expect(clear).toBeDisabled();

    await userEvent.clear(factor);
    await userEvent.type(factor, '0,5');
    expect(clear).toBeEnabled();
    await userEvent.click(clear);
    expect(screen.getByRole('textbox', { name: 'Fator' })).toHaveValue('0,6');
  });

  it('mostra o aviso de versão, esconde o "+N" do parâmetro e traz o detalhe', async () => {
    render(<CalculatorView definition={CLEARANCE} />);

    expect(screen.getByText('Versão simplificada')).toBeInTheDocument();
    expect(screen.getByText('Estimativa rápida, não o escore oficial.')).toBeInTheDocument();
    const sex = screen.getByRole('group', { name: 'Sexo' });
    expect(within(sex).queryByText(/\+/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /Peso/ }), '100');
    await userEvent.click(within(sex).getByRole('radio', { name: 'Feminino' }));

    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('51,0 L');
    expect(within(result).getByText('Metade:')).toBeInTheDocument();
    expect(within(result).getByText('25.5 L')).toBeInTheDocument();
  });

  it('mostra a mensagem da combinação incoerente e destaca o campo', async () => {
    render(<CalculatorView definition={CLEARANCE} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Masculino' }));
    const weight = screen.getByRole('textbox', { name: /Peso/ });
    await userEvent.type(weight, '210');

    expect(screen.getByRole('status')).toHaveTextContent('Confira o peso.');
    expect(weight).toBeInvalid();
  });

  it('mostra a faixa no lugar do número quando a faixa é o resultado', async () => {
    render(<CalculatorView definition={RULE} />);
    await userEvent.click(screen.getByRole('radio', { name: /^Presente/ }));

    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('Teste positivo');
    expect(result).not.toHaveTextContent('ponto');
    expect(result).toHaveAttribute('data-tone', 'red');
  });
});
