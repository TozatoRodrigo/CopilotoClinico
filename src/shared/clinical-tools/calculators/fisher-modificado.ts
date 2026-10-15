import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/**
 * Porte do `fisherModificado` do ANY. Graus e faixas iguais; as ações dos
 * graus 3 e 4 passaram para a forma de sugestão.
 */
export const FISHER_MODIFICADO: ClassificationCalculator = {
  kind: 'classification',
  id: 'fisher-modificado',
  name: 'Escala de Fisher modificada',
  aliases: ['fisher', 'hsa', 'tc', 'tomografia', 'vasoespasmo', 'hemorragia subaracnoidea'],
  category: 'Neurologia',
  description: 'Risco de vasoespasmo cerebral baseado na TC inicial da HSA.',
  reference: {
    why: 'Prediz o risco de vasoespasmo sintomático, guiando a intensidade do monitoramento e do tratamento profilático.',
    whenToUse:
      'Após TC confirmatória de HSA, para classificar a quantidade e a distribuição do sangue.',
    pearlsPitfalls: [
      'A escala modificada inclui hemorragia intraventricular como fator de risco adicional.',
      'Fisher 3–4 tem alto risco de vasoespasmo: monitoramento com Doppler transcraniano recomendado.',
      'TC realizada tardiamente pode subestimar a quantidade de sangue (clearance do sangue).',
      'Não prediz ressangramento, apenas vasoespasmo.',
    ],
    citation:
      'Frontera JA et al. Prediction of symptomatic vasospasm after subarachnoid hemorrhage: the modified Fisher scale. Neurosurgery. 2006;59(1):21-7.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('grade', 'Achados na TC', [
      ['0', 'Grau 0 — sem HSA ou hemorragia intraventricular (HIV)', 0],
      ['1', 'Grau 1 — HSA fina sem HIV', 1],
      ['2', 'Grau 2 — HSA fina com HIV', 2],
      ['3', 'Grau 3 — HSA espessa (cisterna > 1 mm) sem HIV', 3],
      ['4', 'Grau 4 — HSA espessa com HIV', 4],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: '0',
        upTo: { value: 0, inclusive: true },
        label: 'Grau 0',
        tone: 'neutral',
        action: 'Risco de vasoespasmo sintomático: 0%. Monitoramento padrão.',
      },
      {
        id: '1',
        upTo: { value: 1, inclusive: true },
        label: 'Grau 1',
        tone: 'neutral',
        action:
          'Risco de vasoespasmo sintomático: ~24%. Considere monitoramento com Doppler transcraniano.',
      },
      {
        id: '2',
        upTo: { value: 2, inclusive: true },
        label: 'Grau 2',
        tone: 'attention',
        action: 'Risco de vasoespasmo sintomático: ~33%. Considere monitoramento frequente.',
      },
      {
        id: '3',
        upTo: { value: 3, inclusive: true },
        label: 'Grau 3',
        tone: 'critical',
        action:
          'Risco de vasoespasmo sintomático: ~33%. Considere monitoramento frequente e nimodipina.',
      },
    ],
    otherwise: {
      id: '4',
      label: 'Grau 4',
      tone: 'critical',
      action:
        'Risco de vasoespasmo sintomático: ~40%. Alto risco. Considere monitoramento intensivo, nimodipina e angiografia se houver deterioração.',
    },
  },
};
