import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
