import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickQuestion } from '../quick-question';
import type { QuickQuestionCardAnswer, QuickQuestionResponse } from '@/lib/types';

const mutate = vi.fn();
let mutation: {
  mutate: typeof mutate;
  isPending: boolean;
  isError: boolean;
  data: QuickQuestionResponse | undefined;
};

vi.mock('@/lib/clinical-queries', () => ({
  useAskQuickQuestion: () => mutation,
}));

const anaphylaxis: QuickQuestionCardAnswer = {
  cardId: '88888888-8888-4888-8888-888888888888',
  version: 2,
  topic: 'Anafilaxia: adrenalina IM',
  question: 'Qual a dose de adrenalina IM na anafilaxia?',
  population: 'Criança ou adulto com anafilaxia no pronto-socorro',
  answer: 'Adrenalina 0,01 mg/kg IM na face lateral da coxa, até 0,5 mg por dose.',
  answerQuotes: [{ sourceKey: 'S1', quote: 'Adrenalina 0,01 mg/kg por via intramuscular' }],
  doses: [
    {
      drug: 'Adrenalina',
      amount: '0,01 mg/kg',
      route: 'intramuscular',
      frequency: 'a cada 5 a 15 minutos',
      maxDose: '0,5 mg',
      claim: 'Aplicar adrenalina IM assim que reconhecer a anafilaxia.',
      citation: { sourceKey: 'S1', quote: 'Adrenalina 0,01 mg/kg por via intramuscular' },
      weightBased: {
        status: 'computed',
        weightKg: 20,
        perKg: '0,01 mg/kg',
        total: '0,2 mg',
        cappedAtMaxDose: false,
      },
    },
  ],
  sources: [
    {
      key: 'S1',
      title: 'Protocolo de anafilaxia',
      section: '3. Tratamento',
      sourceVersion: '2025-03',
      url: 'https://example.org/anafilaxia.pdf',
      quotes: ['Adrenalina 0,01 mg/kg por via intramuscular'],
    },
  ],
  reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
  reviewedAt: '2026-10-12T15:00:00.000Z',
  validUntil: '2027-10-12T15:00:00.000Z',
};

/**
 * CC-501 — a pergunta rápida só responde com cartão revisado: texto assinado,
 * dose, fonte com o trecho e quem revisou. Sem cartão, diz que falta e
 * oferece abrir um caso.
 */
describe('QuickQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutation = { mutate, isPending: false, isError: false, data: undefined };
  });

  it('envia a pergunta sem espaços sobrando e só a partir de 3 letras', async () => {
    const user = userEvent.setup();
    render(<QuickQuestion />);

    const submit = screen.getByRole('button', { name: /Perguntar/i });
    await user.type(screen.getByRole('textbox', { name: /Sua dúvida/i }), '  ab ');
    expect(submit).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'c dose de adrenalina em criança de 20 kg  ');
    await user.click(submit);

    expect(mutate).toHaveBeenCalledWith({
      question: 'ab c dose de adrenalina em criança de 20 kg',
    });
  });

  it('limita a pergunta a 300 caracteres e avisa para não escrever dado do paciente', () => {
    render(<QuickQuestion />);

    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '300');
    expect(screen.getByText(/Não escreva nome nem documento do paciente/i)).toBeInTheDocument();
  });

  it('mostra a resposta do cartão com a dose, a conta por peso, o trecho da fonte e o revisor', () => {
    mutation.data = { outcome: 'answered', questionId: 'q1', cards: [anaphylaxis] };
    render(<QuickQuestion />);

    expect(screen.getByText('Cartão revisado por médico')).toBeInTheDocument();
    expect(screen.getByText(anaphylaxis.answer)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Adrenalina 0,01 mg/kg · intramuscular · a cada 5 a 15 minutos · máx. 0,5 mg',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Para 20 kg: 0,2 mg (0,01 mg/kg × 20 kg)')).toBeInTheDocument();
    expect(screen.getByText(/Confira antes de prescrever/i)).toBeInTheDocument();
    expect(screen.getByText('“Adrenalina 0,01 mg/kg por via intramuscular”')).toBeInTheDocument();
    expect(
      screen.getByText('Revisado por Dr(a). Ana Souza · CRM 123456/SP · em 12/10/2026'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver cartão completo/i })).toHaveAttribute(
      'href',
      `/cartoes/${anaphylaxis.cardId}`,
    );
  });

  it('dose por kg sem peso pede o peso, sem inventar a conta', () => {
    mutation.data = {
      outcome: 'answered',
      questionId: 'q1',
      cards: [
        {
          ...anaphylaxis,
          doses: [{ ...anaphylaxis.doses[0]!, weightBased: { status: 'needs_weight' } }],
        },
      ],
    };
    render(<QuickQuestion />);

    expect(screen.getByText(/escreva o peso na pergunta/i)).toBeInTheDocument();
    expect(screen.queryByText(/Para 20 kg/)).not.toBeInTheDocument();
  });

  it('sem cartão: diz que ainda não há, que a lacuna foi registrada e oferece abrir um caso', () => {
    mutation.data = { outcome: 'no_card', questionId: 'q1', gapRecorded: true };
    render(<QuickQuestion />);

    expect(screen.getByText('Ainda não temos um cartão revisado para isso.')).toBeInTheDocument();
    expect(screen.getByText(/Registramos a falta/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir um caso/i })).toHaveAttribute(
      'href',
      '/encounters/new',
    );
    expect(screen.queryByText('Cartão revisado por médico')).not.toBeInTheDocument();
  });

  it('busca indisponível não finge que falta cartão', () => {
    mutation.data = { outcome: 'search_unavailable', questionId: 'q1' };
    render(<QuickQuestion />);

    expect(screen.getByText(/busca de cartões revisados está indisponível/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ainda não temos um cartão/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir um caso/i })).toBeInTheDocument();
  });

  it('erro de rede vira aviso, não resposta', () => {
    mutation.isError = true;
    render(<QuickQuestion />);

    expect(screen.getByText(/Não foi possível perguntar agora/i)).toBeInTheDocument();
  });
});
