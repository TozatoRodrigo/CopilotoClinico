import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnderstandingCard } from '../understanding-card';
import type { CaseUnderstanding } from '@/lib/types';

/**
 * F1 — "O que eu entendi" (ADR-013): o médico confere o entendimento do caso
 * antes do plano e corrige o que estiver errado.
 */

function understanding(overrides: Partial<CaseUnderstanding> = {}): CaseUnderstanding {
  return {
    problemRepresentation:
      'Homem de 68 anos com hemiparesia direita e afasia de início súbito há 1h30, sem TC.',
    structuredData: {
      age: 68,
      sex: 'M',
      vitals: {
        systolicBp: 182,
        diastolicBp: 104,
        heartRate: 88,
        respiratoryRate: null,
        spo2: 96,
        temperature: null,
        glucose: null,
      },
      onset: 'há 1h30',
      keyFindings: ['hemiparesia direita', 'afasia'],
      relevantContext: ['uso de varfarina'],
    },
    instability: { present: false, findings: [] },
    syndrome: 'deficit-neurologico-focal',
    syndromeNote: null,
    cannotMiss: [
      {
        hypothesis: 'Hemorragia intracerebral',
        whyPlausible: 'Anticoagulado com déficit súbito',
        confirmOrRuleOut: 'TC de crânio sem contraste',
      },
      {
        hypothesis: 'Hipoglicemia',
        whyPlausible: 'Mimetiza déficit focal',
        confirmOrRuleOut: 'Glicemia capilar',
      },
    ],
    likely: [{ hypothesis: 'AVC isquêmico', why: 'Déficit focal súbito em hipertenso' }],
    missingDiscriminators: [
      {
        data: 'Resultado da TC de crânio sem contraste',
        separates: ['AVC isquêmico', 'AVC hemorrágico'],
        whyItChangesConduct: 'Trombólise só depois de excluir sangramento',
      },
    ],
    searchQueries: ['manejo inicial do AVC agudo'],
    ...overrides,
  };
}

function card() {
  return screen.getByRole('region', { name: /O que eu entendi/i });
}

describe('UnderstandingCard', () => {
  describe('quando não há entendimento', () => {
    it.each([
      ['ausente (legacy ou interação antiga)', undefined],
      ['nulo (a etapa falhou)', null],
    ])('não aparece com entendimento %s', (_label, value) => {
      const { container } = render(<UnderstandingCard understanding={value} />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  it('mostra a representação do problema e a síndrome', () => {
    render(<UnderstandingCard understanding={understanding()} />);

    expect(
      within(card()).getByText(/hemiparesia direita e afasia de início súbito/),
    ).toBeInTheDocument();
    expect(within(card()).getByText('Déficit neurológico focal')).toBeInTheDocument();
  });

  it('mostra uma vez o dado que o modelo repetiu nos achados', () => {
    const base = understanding();
    render(
      <UnderstandingCard
        understanding={understanding({
          structuredData: { ...base.structuredData, keyFindings: ['PA 182x104', 'afasia'] },
        })}
      />,
    );

    expect(within(card()).getAllByText('PA 182x104')).toHaveLength(1);
  });

  it("mostra a descrição quando a síndrome é 'outro'", () => {
    render(
      <UnderstandingCard
        understanding={understanding({ syndrome: 'outro', syndromeNote: 'Epistaxe volumosa' })}
      />,
    );

    expect(within(card()).getByText('Outra síndrome')).toBeInTheDocument();
    expect(within(card()).getByText('Epistaxe volumosa')).toBeInTheDocument();
  });

  it('lista só os dados que o caso informou, em chips', () => {
    render(<UnderstandingCard understanding={understanding()} />);

    const chips = within(card()).getByRole('list', { name: 'Dados informados' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual([
      '68 anos',
      'Masculino',
      'Início: há 1h30',
      'PA 182x104',
      'FC 88',
      'SpO₂ 96%',
      'hemiparesia direita',
      'afasia',
      'uso de varfarina',
    ]);
  });

  it('lista o que não pode perder, do pior para o menos grave, com o que confirma ou afasta', () => {
    render(<UnderstandingCard understanding={understanding()} />);

    const list = within(card()).getByRole('list', { name: 'Não pode perder' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Hemorragia intracerebral');
    expect(items[0]).toHaveTextContent('Confirma ou afasta: TC de crânio sem contraste');
    expect(items[1]).toHaveTextContent('Hipoglicemia');
  });

  it('diz o que falta saber e quais hipóteses cada dado separa', () => {
    render(<UnderstandingCard understanding={understanding()} />);

    const list = within(card()).getByRole('list', { name: /O que falta saber/ });
    expect(within(card()).getByRole('heading', { name: /O que falta saber/ })).toHaveTextContent(
      'Muda a conduta',
    );
    expect(within(list).getByRole('listitem')).toHaveTextContent(
      'Resultado da TC de crânio sem contrasteSepara AVC isquêmico × AVC hemorrágico',
    );
  });

  describe('instabilidade', () => {
    it('não mostra o alerta quando o caso está estável', () => {
      render(<UnderstandingCard understanding={understanding()} />);

      expect(within(card()).queryByText(/Instabilidade/)).not.toBeInTheDocument();
    });

    it('mostra o alerta vermelho com os achados quando há ameaça imediata', () => {
      render(
        <UnderstandingCard
          understanding={understanding({
            instability: { present: true, findings: ['PA 80x40', 'SpO₂ 86%'] },
          })}
        />,
      );

      const alert = within(card())
        .getByText('Instabilidade — ameaça imediata')
        .closest("[data-slot='callout']");
      expect(alert).toHaveAttribute('data-tone', 'red');
      expect(alert).toHaveTextContent('PA 80x40');
      expect(alert).toHaveTextContent('SpO₂ 86%');
    });
  });

  describe('Corrigir entendimento', () => {
    it('não oferece correção sem o fluxo de reanálise (streaming, rodadas esgotadas)', () => {
      render(<UnderstandingCard understanding={understanding()} />);

      expect(
        within(card()).queryByRole('button', { name: /Corrigir entendimento/ }),
      ).not.toBeInTheDocument();
    });

    it('envia a correção digitada e fecha o campo quando a reanálise aceita', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(true);
      render(
        <UnderstandingCard
          understanding={understanding()}
          correction={{ onSubmit, submitting: false }}
        />,
      );

      const toggle = within(card()).getByRole('button', { name: /Corrigir entendimento/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      const field = within(card()).getByLabelText(/entendeu errado ou deixou de fora/);
      expect(field).toHaveFocus();
      await user.type(field, 'O déficit regrediu em 10 minutos e voltou duas vezes.');
      await user.click(within(card()).getByRole('button', { name: /Reanalisar com a correção/ }));

      expect(onSubmit).toHaveBeenCalledWith(
        'O déficit regrediu em 10 minutos e voltou duas vezes.',
      );
      expect(
        within(card()).queryByLabelText(/entendeu errado ou deixou de fora/),
      ).not.toBeInTheDocument();
    });

    it('mantém o texto quando a reanálise falha', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(false);
      render(
        <UnderstandingCard
          understanding={understanding()}
          correction={{ onSubmit, submitting: false }}
        />,
      );

      await user.click(within(card()).getByRole('button', { name: /Corrigir entendimento/ }));
      await user.type(within(card()).getByRole('textbox'), 'Não é AVC.');
      await user.click(within(card()).getByRole('button', { name: /Reanalisar com a correção/ }));

      expect(within(card()).getByRole('textbox')).toHaveValue('Não é AVC.');
    });

    it('não envia correção vazia', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <UnderstandingCard
          understanding={understanding()}
          correction={{ onSubmit, submitting: false }}
        />,
      );

      await user.click(within(card()).getByRole('button', { name: /Corrigir entendimento/ }));
      await user.type(within(card()).getByRole('textbox'), '   ');

      expect(
        within(card()).getByRole('button', { name: /Reanalisar com a correção/ }),
      ).toBeDisabled();
    });

    it('fecha com Esc pelo teclado', async () => {
      const user = userEvent.setup();
      render(
        <UnderstandingCard
          understanding={understanding()}
          correction={{ onSubmit: vi.fn(), submitting: false }}
        />,
      );

      await user.click(within(card()).getByRole('button', { name: /Corrigir entendimento/ }));
      await user.keyboard('{Escape}');

      expect(within(card()).queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('mostra o progresso e bloqueia o envio durante a reanálise', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <UnderstandingCard
          understanding={understanding()}
          correction={{ onSubmit: vi.fn(), submitting: false }}
        />,
      );
      await user.click(within(card()).getByRole('button', { name: /Corrigir entendimento/ }));
      await user.type(within(card()).getByRole('textbox'), 'Não é AVC.');

      rerender(
        <UnderstandingCard
          understanding={understanding()}
          correction={{ onSubmit: vi.fn(), submitting: true }}
        />,
      );

      expect(within(card()).getByRole('button', { name: /Reanalisando/ })).toBeDisabled();
    });
  });
});
