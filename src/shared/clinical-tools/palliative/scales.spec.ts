import { describe, expect, it } from 'vitest';
import { evaluateCalculator, type CalculatorEvaluation } from '../calculator';
import { buildChartNote } from '../chart-note';
import {
  buildEcogChartNote,
  buildPpsChartNote,
  ECOG_LEVELS,
  ecogLevel,
  PPI_BANDS,
  PPI_CALCULATOR,
  PPS_LEVELS,
  ppsLevel,
} from './scales';

type PpiAnswers = Partial<Record<string, string>>;

const MINIMUM: PpiAnswers = {
  pps: 'ge60',
  oral: 'normal',
  edema: 'ausente',
  dispneia: 'ausente',
  delirium: 'ausente',
};

function ppi(answers: PpiAnswers): Extract<CalculatorEvaluation, { status: 'complete' }> {
  const result = evaluateCalculator(PPI_CALCULATOR, { items: answers });
  if (result.status !== 'complete') throw new Error('PPI incompleto');
  return result;
}

describe('PPI', () => {
  it('fica pendente até os cinco itens terem resposta', () => {
    expect(evaluateCalculator(PPI_CALCULATOR, { items: { pps: 'ge60' } })).toMatchObject({
      status: 'pending',
      missing: ['Ingesta Oral', 'Edema', 'Dispneia em Repouso', 'Delirium'],
    });
  });

  it.each([
    [{}, 0, 'melhor'],
    [{ pps: '30-50' }, 2.5, 'intermediario'],
    [{ edema: 'presente', oral: 'moderada' }, 2, 'melhor'],
    [{ delirium: 'presente' }, 4, 'intermediario'],
    [{ delirium: 'presente', edema: 'presente' }, 5, 'reservado'],
    [{ pps: '10-20', oral: 'moderada', edema: 'presente' }, 6, 'reservado'],
    [{ dispneia: 'presente', edema: 'presente', oral: 'muito-reduzida' }, 7, 'muito-reservado'],
    [
      {
        pps: '10-20',
        oral: 'muito-reduzida',
        edema: 'presente',
        dispneia: 'presente',
        delirium: 'presente',
      },
      15,
      'muito-reservado',
    ],
  ] as const)('%o soma %d e cai na faixa %s', (answers, value, band) => {
    const result = ppi({ ...MINIMUM, ...answers });
    expect(result.value).toBe(value);
    expect(result.band.id).toBe(band);
  });

  it('nos cortes do ANY (≤ 2, ≤ 4, ≤ 6) a faixa é a de baixo', () => {
    const bounded = PPI_BANDS.filter(({ upTo }) => upTo !== undefined).map(({ upTo }) => upTo);
    expect(bounded).toEqual([2, 4, 6]);
  });

  it('a sugestão traz a sobrevida mediana e, nas faixas altas, a acurácia', () => {
    expect(ppi(MINIMUM).band.action).toBe('Sobrevida mediana: ~155 dias.');
    expect(ppi({ ...MINIMUM, delirium: 'presente', dispneia: 'presente' }).band).toMatchObject({
      label: 'Prognóstico muito reservado',
      tone: 'critical',
      action: 'Sobrevida mediana: ~5 dias (sobrevida <3 semanas: sens 80%, esp 85%).',
    });
  });

  it('o texto do prontuário usa o motor das calculadoras', () => {
    const note = buildChartNote(PPI_CALCULATOR, ppi({ ...MINIMUM, pps: '30-50' }));
    expect(note).toContain(
      'PPI (Palliative Prognostic Index): 2,5 pontos — Prognóstico intermediário.',
    );
    expect(note).toContain('- PPS (Palliative Performance Scale): 30-50% (+2,5)');
    expect(note).toContain('Referência: Morita T, et al.');
  });
});

describe('ECOG e PPS', () => {
  it('tem os 6 níveis do ECOG e os 11 do PPS, em ordem', () => {
    expect(ECOG_LEVELS.map(({ grade }) => grade)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(PPS_LEVELS.map(({ percent }) => percent)).toEqual([
      100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0,
    ]);
  });

  it('acha o nível pelo grau e pela porcentagem', () => {
    expect(ecogLevel(3).label).toBe('>50% acamado');
    expect(ppsLevel(20).intake).toBe('Goles');
  });

  it('monta o texto do prontuário sem campo vazio', () => {
    expect(buildEcogChartNote(2)).toBe(
      'ECOG 2 — <50% acamado: Ambulatorial, capaz de autocuidado, incapaz de trabalho; <50% do tempo acordado no leito.\nReferência: Oken MM, et al. ECOG Performance Status. Am J Clin Oncol. 1982.',
    );
    expect(buildEcogChartNote(5).split('\n')[0]).toBe('ECOG 5 — Óbito.');
    expect(buildPpsChartNote(0).split('\n')).toEqual([
      'PPS 0%.',
      '- Deambulação: Óbito',
      'Referência: Anderson F, et al. Palliative Performance Scale (PPS). J Palliat Care. 1996.',
    ]);
    expect(buildPpsChartNote(50).split('\n')).toHaveLength(7);
  });
});
