import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/** Porte do `correçãoCalcio` do ANY. Mesma conta (2 casas) e faixas; ações como sugestão. */
export const CORRECAO_CALCIO: FormulaCalculator = {
  kind: 'formula',
  id: 'correcao-calcio',
  name: 'Correção de cálcio pela albumina',
  aliases: ['cálcio', 'cálcio corrigido', 'albumina', 'hipocalcemia', 'hipercalcemia'],
  category: 'Renal / Metabólico',
  description: 'Cálculo do cálcio corrigido pela albumina sérica.',
  reference: {
    why: 'O cálcio total é influenciado pela albumina. A correção evita diagnósticos falsos de hipo ou hipercalcemia.',
    whenToUse:
      'Pacientes com hipoalbuminemia, para interpretar corretamente o cálcio sérico total.',
    pearlsPitfalls: [
      'Fórmula: Ca corrigido = Ca medido + 0,8 × (4,0 - albumina).',
      'Cada 1 g/dL de redução da albumina abaixo de 4 reduz o cálcio total em ~0,8 mg/dL.',
      'O cálcio ionizado é o padrão-ouro, mas nem sempre está disponível.',
      'Não é preciso em acidose ou alcalose graves (alteram a ligação cálcio-albumina).',
      'Albumina de referência: 4,0 g/dL.',
    ],
    citation:
      'Payne RB et al. Interpretation of serum calcium in patients with abnormal serum proteins. Br Med J. 1973;4(5893):643-6.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'calcium', label: 'Cálcio total medido', unit: 'mg/dL', min: 2, max: 20, step: 0.1 },
    { id: 'albumin', label: 'Albumina sérica', unit: 'g/dL', min: 0.5, max: 6, step: 0.1 },
  ],
  decimals: 2,
  unit: 'mg/dL',
  compute: (values) =>
    Math.round(
      (requireValue(values, 'calcium') + 0.8 * (4.0 - requireValue(values, 'albumin'))) * 100,
    ) / 100,
  interpretation: {
    bands: [
      {
        id: 'hipocalcemia',
        upTo: { value: 8.5, inclusive: false },
        label: 'Hipocalcemia',
        tone: 'attention',
        action:
          'Cálcio corrigido abaixo do normal (8,5–10,5). Considere investigar a causa e reposição.',
      },
      {
        id: 'normal',
        upTo: { value: 10.5, inclusive: true },
        label: 'Normal',
        tone: 'neutral',
        action: 'Cálcio corrigido dentro da faixa normal (8,5–10,5 mg/dL).',
      },
    ],
    otherwise: {
      id: 'hipercalcemia',
      label: 'Hipercalcemia',
      tone: 'critical',
      action:
        'Cálcio corrigido elevado. Considere investigar a causa (hiperparatireoidismo, neoplasia) e hidratação.',
    },
  },
};
