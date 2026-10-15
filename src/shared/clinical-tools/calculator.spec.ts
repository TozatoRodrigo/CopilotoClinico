import { describe, expect, it, vi } from 'vitest';
import {
  allBands,
  byRule,
  evaluateCalculator,
  findBand,
  formatResultValue,
  interpretValue,
  itemShowsPoints,
  requireValue,
  type ClassificationCalculator,
  type FormulaCalculator,
  type Interpretation,
  type ScoreCalculator,
} from './calculator';
import { buildChartNote } from './chart-note';
import type { ContentProvenance } from './provenance';

const PROVENANCE: ContentProvenance = {
  source: 'teste',
  version: '0.0.0',
  updatedAt: '2026-10-14',
  review: { status: 'pendente' },
};

const REFERENCE = { why: 'w', whenToUse: 'q', pearlsPitfalls: ['p'], citation: 'c' };

const TWO_BANDS: Interpretation = {
  bands: [
    {
      id: 'baixo',
      upTo: { value: 1, inclusive: true },
      label: 'Baixo',
      tone: 'neutral',
      action: 'a',
    },
  ],
  otherwise: { id: 'alto', label: 'Alto', tone: 'critical', action: 'b' },
};

const SCORE: ScoreCalculator = {
  kind: 'score',
  id: 'escore',
  name: 'Escore',
  aliases: [],
  category: 'Teste',
  description: '',
  reference: REFERENCE,
  provenance: PROVENANCE,
  interpretation: TWO_BANDS,
  items: [
    {
      id: 'a',
      label: 'Item A',
      options: [
        { id: 'nao', label: 'Não', points: 0 },
        { id: 'sim', label: 'Sim', points: 1 },
      ],
    },
    {
      id: 'b',
      label: 'Item B',
      options: [
        { id: 'nao', label: 'Não', points: 0 },
        { id: 'sim', label: 'Sim', points: 2 },
      ],
    },
  ],
};

function formula(compute: FormulaCalculator['compute']): FormulaCalculator {
  return {
    kind: 'formula',
    id: 'formula',
    name: 'Fórmula',
    aliases: [],
    category: 'Teste',
    description: '',
    reference: REFERENCE,
    provenance: PROVENANCE,
    interpretation: TWO_BANDS,
    inputs: [{ id: 'peso', label: 'Peso', unit: 'kg', min: 40, max: 200, step: 0.1 }],
    decimals: 1,
    unit: 'mL',
    compute,
  };
}

describe('evaluateCalculator — escore', () => {
  it('fica pendente até todos os itens terem resposta', () => {
    expect(evaluateCalculator(SCORE, {})).toEqual({
      status: 'pending',
      missing: ['Item A', 'Item B'],
      errors: {},
    });
    expect(evaluateCalculator(SCORE, { items: { a: 'sim' } })).toMatchObject({
      status: 'pending',
      missing: ['Item B'],
    });
  });

  it('soma os pontos, escolhe a faixa e resume as respostas', () => {
    const result = evaluateCalculator(SCORE, { items: { a: 'sim', b: 'sim' } });
    expect(result).toEqual({
      status: 'complete',
      value: 3,
      band: TWO_BANDS.otherwise,
      answers: [
        { label: 'Item A', answer: 'Sim (+1)' },
        { label: 'Item B', answer: 'Sim (+2)' },
      ],
      details: [],
    });
  });

  it('mostra ponto negativo no resumo das respostas', () => {
    const negative: ScoreCalculator = {
      ...SCORE,
      items: [
        {
          id: 'a',
          label: 'Pródromos',
          options: [
            { id: 'nao', label: 'Não', points: 0 },
            { id: 'sim', label: 'Sim', points: -1 },
          ],
        },
      ],
    };
    expect(evaluateCalculator(negative, { items: { a: 'sim' } })).toMatchObject({
      value: -1,
      answers: [{ label: 'Pródromos', answer: 'Sim (-1)' }],
    });
  });

  it('trata opção desconhecida como item sem resposta', () => {
    expect(evaluateCalculator(SCORE, { items: { a: 'talvez', b: 'nao' } })).toMatchObject({
      status: 'pending',
      missing: ['Item A'],
    });
  });
});

describe('evaluateCalculator — classificação', () => {
  it('usa o grau escolhido como valor', () => {
    const classification: ClassificationCalculator = {
      ...SCORE,
      kind: 'classification',
      items: [
        {
          id: 'grau',
          label: 'Grau',
          options: [
            { id: 'i', label: 'Grau I', points: 1 },
            { id: 'ii', label: 'Grau II', points: 2 },
          ],
        },
      ],
    };
    const result = evaluateCalculator(classification, { items: { grau: 'ii' } });
    expect(result).toMatchObject({
      status: 'complete',
      value: 2,
      band: { id: 'alto' },
      // O grau já está no rótulo: classificação não mostra "+2".
      answers: [{ label: 'Grau', answer: 'Grau II' }],
    });
    expect(formatResultValue(classification, 2)).toBe('2');
    expect(itemShowsPoints(classification, classification.items[0]!)).toBe(false);
  });
});

describe('evaluateCalculator — faixa por regra', () => {
  // Forma do CAM-ICU: o valor (soma) não decide; a regra lê cada item.
  const rule: ScoreCalculator = {
    ...SCORE,
    interpretation: byRule(
      [
        { id: 'positivo', label: 'Positivo', tone: 'critical', action: 'p' },
        { id: 'negativo', label: 'Negativo', tone: 'neutral', action: 'n' },
      ],
      (_value, values) => (values.a === 1 && values.b === 2 ? 'positivo' : 'negativo'),
    ),
    formatValue: () => null,
  };

  it('escolhe a faixa pela regra e não mostra número', () => {
    expect(evaluateCalculator(rule, { items: { a: 'sim', b: 'sim' } })).toMatchObject({
      band: { id: 'positivo', tone: 'critical' },
    });
    expect(evaluateCalculator(rule, { items: { a: 'sim', b: 'nao' } })).toMatchObject({
      band: { id: 'negativo' },
    });
    expect(formatResultValue(rule, 3)).toBeNull();
    expect(allBands(rule.interpretation).map(({ id }) => id)).toEqual(['positivo', 'negativo']);
  });

  it('falha alto se a regra devolver faixa que não existe', () => {
    const broken = { bands: [], select: () => 'nenhuma' };
    expect(() => interpretValue(broken, 0, {})).toThrow(/nenhuma/);
  });
});

describe('evaluateCalculator — fórmula', () => {
  it('não calcula com valor fora da faixa', () => {
    const compute = vi.fn(() => 1);
    const result = evaluateCalculator(formula(compute), { inputs: { peso: '39,9' } });
    expect(result.status).toBe('pending');
    if (result.status === 'pending') {
      expect(result.errors.peso?.kind).toBe('out-of-range');
      expect(result.missing).toEqual([]);
    }
    expect(compute).not.toHaveBeenCalled();
  });

  it('não calcula com campo vazio ou ilegível', () => {
    const compute = vi.fn(() => 1);
    expect(evaluateCalculator(formula(compute), { inputs: {} })).toMatchObject({
      status: 'pending',
      missing: ['Peso'],
    });
    expect(evaluateCalculator(formula(compute), { inputs: { peso: '7O' } })).toMatchObject({
      status: 'pending',
      errors: { peso: { kind: 'not-a-number' } },
    });
    expect(compute).not.toHaveBeenCalled();
  });

  it('calcula com o valor lido da vírgula e mostra a unidade', () => {
    const calculator = formula((values) => requireValue(values, 'peso') / 100);
    const result = evaluateCalculator(calculator, { inputs: { peso: '72,5' } });
    expect(result).toMatchObject({
      status: 'complete',
      value: 0.725,
      band: { id: 'baixo' },
      answers: [{ label: 'Peso', answer: '72,5 kg' }],
    });
    expect(formatResultValue(calculator, 0.725)).toBe('0,7 mL');
  });

  it('usa o valor padrão do campo opcional vazio e avisa no resumo', () => {
    const calculator: FormulaCalculator = {
      ...formula((values) => requireValue(values, 'peso') + requireValue(values, 'albumina')),
      inputs: [
        { id: 'peso', label: 'Peso', unit: 'kg', min: 40, max: 200, step: 0.1 },
        {
          id: 'albumina',
          label: 'Albumina',
          unit: 'g/dL',
          min: 0.5,
          max: 6,
          step: 0.1,
          defaultValue: 4,
          optional: true,
        },
      ],
    };
    expect(evaluateCalculator(calculator, { inputs: { peso: '70' } })).toMatchObject({
      status: 'complete',
      value: 74,
      answers: [
        { label: 'Peso', answer: '70 kg' },
        { label: 'Albumina', answer: '4 g/dL (padrão)' },
      ],
    });
    // Preenchido fora da faixa continua sendo erro: o padrão só cobre o vazio.
    expect(evaluateCalculator(calculator, { inputs: { peso: '70', albumina: '9' } }).status).toBe(
      'pending',
    );
  });

  it('não mostra "+N" para parâmetro de fórmula', () => {
    const calculator: FormulaCalculator = {
      ...formula((values) => requireValue(values, 'peso') * requireValue(values, 'sexo')),
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
    };
    const result = evaluateCalculator(calculator, {
      inputs: { peso: '100' },
      items: { sexo: 'f' },
    });
    expect(result).toMatchObject({
      value: 85,
      answers: [
        { label: 'Sexo', answer: 'Feminino' },
        { label: 'Peso', answer: '100 kg' },
      ],
    });
  });

  it('não calcula quando a combinação dos campos não fecha', () => {
    const compute = vi.fn(() => 1);
    const calculator: FormulaCalculator = {
      ...formula(compute),
      check: (values) =>
        requireValue(values, 'peso') > 150 ? { inputId: 'peso', message: 'Confira o peso.' } : null,
    };
    expect(evaluateCalculator(calculator, { inputs: { peso: '160' } })).toEqual({
      status: 'pending',
      missing: [],
      errors: { peso: { kind: 'inconsistent', message: 'Confira o peso.' } },
    });
    expect(compute).not.toHaveBeenCalled();
  });

  it('passa a data do dia e devolve os resultados secundários', () => {
    const today = new Date(2026, 9, 14);
    const calculator: FormulaCalculator = {
      ...formula((_values, context) => context.today.getDate()),
      details: (value) => [{ label: 'Dia', value: String(value) }],
    };
    expect(evaluateCalculator(calculator, { inputs: { peso: '70' } }, { today })).toMatchObject({
      value: 14,
      details: [{ label: 'Dia', value: '14' }],
    });
  });
});

describe('buildChartNote', () => {
  it('leva o detalhe, o aviso de versão e a referência; sem número quando a faixa é o resultado', () => {
    const calculator: ScoreCalculator = {
      ...SCORE,
      versionNotice: { title: 'Versão simplificada', text: 'Estimativa rápida.' },
      formatValue: () => null,
    };
    const note = buildChartNote(calculator, {
      value: 3,
      band: TWO_BANDS.otherwise,
      answers: [{ label: 'Item A', answer: 'Sim (+1)' }],
      details: [{ label: 'Linha', value: '105,9 mcg/mL' }],
    });
    expect(note.split('\n')).toEqual([
      'Escore: Alto.',
      'Linha: 105,9 mcg/mL.',
      '- Item A: Sim (+1)',
      'Sugestão: b',
      'Versão simplificada: Estimativa rápida.',
      'Referência: c',
    ]);
  });
});

describe('findBand', () => {
  const bands: Interpretation = {
    bands: [
      { id: 'a', upTo: { value: 0.7, inclusive: false }, label: 'A', tone: 'neutral', action: '' },
      { id: 'b', upTo: { value: 1, inclusive: true }, label: 'B', tone: 'attention', action: '' },
    ],
    otherwise: { id: 'c', label: 'C', tone: 'critical', action: '' },
  };

  it('respeita limite exclusivo e inclusivo, e cai no "acima" depois do último', () => {
    expect(findBand(bands, 0.69).id).toBe('a');
    expect(findBand(bands, 0.7).id).toBe('b');
    expect(findBand(bands, 1).id).toBe('b');
    expect(findBand(bands, 1.01).id).toBe('c');
  });
});

describe('requireValue', () => {
  it('falha alto quando o campo não chegou ao cálculo', () => {
    expect(() => requireValue({}, 'hr')).toThrow(/hr/);
    expect(requireValue({ hr: 0 }, 'hr')).toBe(0);
  });
});

describe('formatResultValue', () => {
  it('escreve ponto no singular e pontos no plural', () => {
    expect(formatResultValue(SCORE, 0)).toBe('0 pontos');
    expect(formatResultValue(SCORE, 1)).toBe('1 ponto');
    expect(formatResultValue(SCORE, 1.5)).toBe('1,5 pontos');
  });
});
