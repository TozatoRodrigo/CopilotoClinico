import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Pontos por faixa, na ordem do ANY: vale o primeiro limite que o valor não alcança. */
function pointsBelow(value: number, table: readonly (readonly [number, number])[], top: number) {
  for (const [limit, points] of table) if (value < limit) return points;
  return top;
}

/**
 * Porte do `graceScore` do ANY ("aproximação"): mesmas faixas de pontos e o
 * mesmo `|| 0` dos selects. O aviso de versão é exigência do CC-307; o texto
 * abaixo é provisório até o Dr. Gustavo definir o final (CC-310).
 */
export const GRACE_SCORE: FormulaCalculator = {
  kind: 'formula',
  id: 'grace-score',
  name: 'GRACE Score (aproximação)',
  aliases: ['grace', 'sca', 'síndrome coronariana', 'mortalidade iam'],
  category: 'Cardiologia / SCA',
  description:
    'Estimativa de mortalidade pós-SCA. Aproximação do GRACE: o escore oficial usa nomograma não linear; para decisão formal, use a calculadora GRACE 2.0.',
  versionNotice: {
    title: 'Versão aproximada',
    text: 'Pontuação por faixas do GRACE. O escore oficial (GRACE 2.0) usa nomograma não linear; para decisão formal, prefira a calculadora oficial.',
  },
  reference: {
    why: 'Mais preciso que o TIMI para predizer mortalidade; recomendado pela ESC para decidir a estratégia invasiva.',
    whenToUse:
      'Após o diagnóstico de SCA (IAMCSST ou IAMSSST), para guiar o tempo do cateterismo e o nível de cuidado.',
    pearlsPitfalls: [
      'A versão 2.0 permite o cálculo mesmo sem todas as variáveis (usando imputação).',
      'Killip III–IV e PCR na admissão são os maiores preditores de mortalidade.',
      'O calculador original usa um nomograma não linear; a versão simplificada aqui é uma aproximação.',
      'Creatinina elevada pode refletir doença renal crônica prévia, não apenas disfunção aguda.',
    ],
    citation:
      'Fox KA et al. Prediction of risk of death and myocardial infarction in the six months after presentation with acute coronary syndrome: prospective multinational observational study (GRACE). BMJ. 2006;333(7578):1091.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'age', label: 'Idade', unit: 'anos', min: 18, max: 120, step: 1 },
    { id: 'hr', label: 'Frequência cardíaca', unit: 'bpm', min: 30, max: 250, step: 1 },
    { id: 'sbp', label: 'Pressão arterial sistólica', unit: 'mmHg', min: 40, max: 300, step: 1 },
    { id: 'creatinine', label: 'Creatinina', unit: 'mg/dL', min: 0.1, max: 20, step: 0.1 },
  ],
  items: [
    choiceItem('killip', 'Classe de Killip', [
      ['i', 'I — sem sinais de IC', 0],
      ['ii', 'II — estertores, B3', 20],
      ['iii', 'III — edema pulmonar', 39],
      ['iv', 'IV — choque cardiogênico', 59],
    ]),
    choiceItem('arrest', 'Parada cardíaca na admissão', [
      ['nao', 'Não', 0],
      ['sim', 'Sim', 39],
    ]),
    choiceItem('stdev', 'Desvio de segmento ST', [
      ['nao', 'Não', 0],
      ['sim', 'Sim', 28],
    ]),
    choiceItem('troponin', 'Troponina elevada', [
      ['nao', 'Não', 0],
      ['sim', 'Sim', 14],
    ]),
  ],
  decimals: 0,
  unit: 'pontos',
  compute: (values) => {
    const age = pointsBelow(
      requireValue(values, 'age'),
      [
        [30, 0],
        [40, 8],
        [50, 25],
        [60, 41],
        [70, 58],
        [80, 75],
        [90, 91],
      ],
      100,
    );
    const hr = pointsBelow(
      requireValue(values, 'hr'),
      [
        [50, 0],
        [70, 3],
        [90, 9],
        [110, 15],
        [150, 24],
        [200, 38],
      ],
      46,
    );
    const sbp = pointsBelow(
      requireValue(values, 'sbp'),
      [
        [80, 58],
        [100, 53],
        [120, 43],
        [140, 34],
        [160, 24],
        [200, 10],
      ],
      0,
    );
    const creatinine = pointsBelow(
      requireValue(values, 'creatinine'),
      [
        [0.4, 1],
        [0.8, 4],
        [1.2, 7],
        [1.6, 10],
        [2.0, 13],
        [4.0, 21],
      ],
      28,
    );
    return (
      age +
      hr +
      sbp +
      creatinine +
      requireValue(values, 'killip') +
      requireValue(values, 'arrest') +
      requireValue(values, 'stdev') +
      requireValue(values, 'troponin')
    );
  },
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 108, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'Mortalidade intra-hospitalar < 1%. Considere abordagem não invasiva.',
      },
      {
        id: 'intermediario',
        upTo: { value: 140, inclusive: true },
        label: 'Risco intermediário',
        tone: 'attention',
        action: 'Mortalidade intra-hospitalar 1–3%. Considere estratificação invasiva em < 72 h.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action: 'Mortalidade intra-hospitalar > 3%. Considere estratificação invasiva em < 24 h.',
    },
  },
};
