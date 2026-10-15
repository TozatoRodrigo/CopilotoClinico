import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `meldNa` do ANY. Mesmos limites (bilirrubina e INR ≥ 1, creatinina
 * de 1 a 4, sódio de 125 a 137), o mesmo arredondamento do MELD antes do
 * ajuste pelo sódio e o resultado entre 6 e 40. Ações como sugestão.
 */
export const MELD_NA: FormulaCalculator = {
  kind: 'formula',
  id: 'meld-na',
  name: 'MELD-Na',
  aliases: ['meld', 'transplante hepático', 'cirrose', 'mortalidade hepática'],
  category: 'Gastro / Hepato',
  description: 'Gravidade da doença hepática e priorização para transplante.',
  reference: {
    why: 'Padrão para a lista de transplante hepático. O MELD-Na adiciona o sódio, melhorando a predição em pacientes com hiponatremia.',
    whenToUse:
      'Pacientes com cirrose, para estimar mortalidade em 90 dias e prioridade de transplante.',
    pearlsPitfalls: [
      'Creatinina limitada a 4,0 mg/dL. Se diálise ≥ 2x na semana, usar Cr = 4,0.',
      'INR e bilirrubina mínimos de 1,0 no cálculo.',
      'Sódio limitado a 125–137 mEq/L na fórmula.',
      'MELD ≥ 15 = benefício do transplante supera o risco.',
      'MELD ≥ 40 = mortalidade em 3 meses > 71%.',
    ],
    citation:
      'Kim WR et al. Hyponatremia and mortality among patients on the liver-transplant waiting list. N Engl J Med. 2008;359(10):1018-26.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'bilirubin', label: 'Bilirrubina total', unit: 'mg/dL', min: 0.1, max: 50, step: 0.1 },
    { id: 'inr', label: 'INR', unit: '', min: 0.5, max: 10, step: 0.1 },
    { id: 'creatinine', label: 'Creatinina', unit: 'mg/dL', min: 0.1, max: 15, step: 0.1 },
    { id: 'sodium', label: 'Sódio', unit: 'mEq/L', min: 100, max: 160, step: 1 },
  ],
  decimals: 0,
  compute: (values) => {
    const bili = Math.max(1, requireValue(values, 'bilirubin'));
    const inr = Math.max(1, requireValue(values, 'inr'));
    const cr = Math.min(4, Math.max(1, requireValue(values, 'creatinine')));
    const na = Math.min(137, Math.max(125, requireValue(values, 'sodium')));
    const meld =
      10 * (0.957 * Math.log(cr) + 0.378 * Math.log(bili) + 1.12 * Math.log(inr) + 0.643);
    const meldRound = Math.round(meld);
    const meldNa = meldRound + 1.32 * (137 - na) - 0.033 * meldRound * (137 - na);
    return Math.round(Math.max(6, Math.min(40, meldNa)));
  },
  interpretation: {
    bands: [
      {
        id: 'lte9',
        upTo: { value: 9, inclusive: true },
        label: 'MELD-Na ≤ 9',
        tone: 'neutral',
        action: 'Mortalidade em 3 meses: ~2%. Acompanhamento ambulatorial.',
      },
      {
        id: '10-19',
        upTo: { value: 19, inclusive: true },
        label: 'MELD-Na 10–19',
        tone: 'attention',
        action:
          'Mortalidade em 3 meses: ~6%. Considere monitoramento regular; listar se MELD ≥ 15.',
      },
      {
        id: '20-29',
        upTo: { value: 29, inclusive: true },
        label: 'MELD-Na 20–29',
        tone: 'critical',
        action: 'Mortalidade em 3 meses: ~20%. Prioridade na lista de transplante.',
      },
      {
        id: '30-39',
        upTo: { value: 39, inclusive: true },
        label: 'MELD-Na 30–39',
        tone: 'critical',
        action: 'Mortalidade em 3 meses: ~52%. Urgência para transplante.',
      },
    ],
    otherwise: {
      id: 'gte40',
      label: 'MELD-Na ≥ 40',
      tone: 'critical',
      action: 'Mortalidade em 3 meses: ~71%. Máxima prioridade para transplante.',
    },
  },
};
