import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Porte do `childPugh` do ANY. Itens, pontos e faixas iguais; só acentuação corrigida. */
export const CHILD_PUGH: ScoreCalculator = {
  kind: 'score',
  id: 'child-pugh',
  name: 'Child-Pugh Score',
  aliases: ['child', 'pugh', 'cirrose', 'hepatopatia', 'insuficiência hepática'],
  category: 'Gastro / Hepato',
  description: 'Classificação de gravidade da doença hepática crônica (cirrose).',
  reference: {
    why: 'Prediz sobrevida em 1–2 anos e guia a indicação de transplante hepático.',
    whenToUse: 'Pacientes com cirrose hepática, para estratificar gravidade e prognóstico.',
    pearlsPitfalls: [
      'Child A (5–6) = sobrevida em 1 ano ~100%. Child C (10–15) = sobrevida em 1 ano ~45%.',
      'Encefalopatia e ascite são avaliações clínicas subjetivas: pode haver variabilidade.',
      'O MELD é preferido para a lista de transplante; o Child-Pugh, para prognóstico geral.',
      'Albumina e tempo de protrombina refletem a função sintética hepática.',
    ],
    citation:
      'Pugh RN et al. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg. 1973;60(8):646-9.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('bilirubin', 'Bilirrubina total', [
      ['lt2', '< 2 mg/dL', 1],
      ['2-3', '2–3 mg/dL', 2],
      ['gt3', '> 3 mg/dL', 3],
    ]),
    choiceItem('albumin', 'Albumina', [
      ['gt3.5', '> 3,5 g/dL', 1],
      ['2.8-3.5', '2,8–3,5 g/dL', 2],
      ['lt2.8', '< 2,8 g/dL', 3],
    ]),
    choiceItem('inr', 'INR (tempo de protrombina)', [
      ['lt1.7', '< 1,7', 1],
      ['1.7-2.3', '1,7–2,3', 2],
      ['gt2.3', '> 2,3', 3],
    ]),
    choiceItem('ascites', 'Ascite', [
      ['ausente', 'Ausente', 1],
      ['leve', 'Leve (controlada com diuréticos)', 2],
      ['grave', 'Moderada a grave (refratária)', 3],
    ]),
    choiceItem('encephalopathy', 'Encefalopatia hepática', [
      ['ausente', 'Ausente', 1],
      ['i-ii', 'Grau I–II (leve, controlada)', 2],
      ['iii-iv', 'Grau III–IV (grave, refratária)', 3],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'a',
        upTo: { value: 6, inclusive: true },
        label: 'Child A — doença compensada',
        tone: 'neutral',
        action: 'Sobrevida em 1 ano ~100%; em 2 anos ~85%. Cirurgia geralmente bem tolerada.',
      },
      {
        id: 'b',
        upTo: { value: 9, inclusive: true },
        label: 'Child B — comprometimento funcional significativo',
        tone: 'attention',
        action: 'Sobrevida em 1 ano ~81%; em 2 anos ~57%. Cirurgia com risco elevado.',
      },
    ],
    otherwise: {
      id: 'c',
      label: 'Child C — doença descompensada',
      tone: 'critical',
      action: 'Sobrevida em 1 ano ~45%; em 2 anos ~35%. Considere avaliação para transplante.',
    },
  },
};
