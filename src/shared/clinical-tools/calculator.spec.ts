import { describe, expect, it, vi } from 'vitest';
import {
  evaluateCalculator,
  findBand,
  formatResultValue,
  requireValue,
  type ClassificationCalculator,
  type FormulaCalculator,
  type Interpretation,
  type ScoreCalculator,
} from './calculator';
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
    expect(result).toMatchObject({ status: 'complete', value: 2, band: { id: 'alto' } });
    expect(formatResultValue(classification, 2)).toBe('2');
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
