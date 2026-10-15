import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `intervaloOsmolar` do ANY. Mesma conta (medida - (2 × Na +
 * glicose/18 + ureia/6), uma casa) e faixas; ações como sugestão.
 */
export const INTERVALO_OSMOLAR: FormulaCalculator = {
  kind: 'formula',
  id: 'intervalo-osmolar',
  name: 'Intervalo osmolar (gap osmolar)',
  aliases: ['gap osmolar', 'osmolar gap', 'metanol', 'etilenoglicol', 'intóxicação alcool toxico'],
  category: 'Toxicologia',
  description:
    'Diferença entre a osmolaridade medida e a calculada, para detectar osmóis não medidos.',
  reference: {
    why: 'Gap osmolar > 10 sugere a presença de soluto não medido (metanol, etilenoglicol, etanol).',
    whenToUse: 'Suspeita de intoxicação por álcool tóxico ou avaliação de distúrbios osmolares.',
    pearlsPitfalls: [
      'Gap = osmolaridade medida - osmolaridade calculada.',
      'Calculada: 2 × Na + glicose/18 + ureia/6.',
      'Normal: < 10 mOsm/kg.',
      'Gap elevado + acidose com AG elevado = álcool tóxico até prova em contrário.',
      'O etanol contribui: cada 100 mg/dL ~22 mOsm. Subtrair se o etanol for medido.',
      'Gap normal não exclui intoxicação em fase tardia (já metabolizado).',
    ],
    citation:
      'Kraut JA, Kurtz I. Toxic alcohol ingestions: clinical features, diagnosis, and management. Clin J Am Soc Nephrol. 2008;3(1):208-25.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    {
      id: 'osm_measured',
      label: 'Osmolaridade medida',
      unit: 'mOsm/kg',
      min: 200,
      max: 500,
      step: 1,
    },
    { id: 'na', label: 'Sódio', unit: 'mEq/L', min: 100, max: 180, step: 1 },
    { id: 'glucose', label: 'Glicose', unit: 'mg/dL', min: 20, max: 1000, step: 1 },
    { id: 'urea', label: 'Ureia', unit: 'mg/dL', min: 1, max: 300, step: 1 },
  ],
  decimals: 1,
  unit: 'mOsm/kg',
  compute: (values) => {
    const calculated =
      2 * requireValue(values, 'na') +
      requireValue(values, 'glucose') / 18 +
      requireValue(values, 'urea') / 6;
    return Math.round((requireValue(values, 'osm_measured') - calculated) * 10) / 10;
  },
  interpretation: {
    bands: [
      {
        id: 'normal',
        upTo: { value: 10, inclusive: false },
        label: 'Normal',
        tone: 'neutral',
        action:
          'Gap osmolar normal (< 10). Álcool tóxico improvável (porém não excluído em fase tardia de metabolismo).',
      },
      {
        id: 'elevado',
        upTo: { value: 20, inclusive: false },
        label: 'Elevado',
        tone: 'attention',
        action:
          'Gap osmolar elevado. Considere etanol, metanol, etilenoglicol, isopropanol e acetona; considere medir o álcool sérico, se disponível.',
      },
    ],
    otherwise: {
      id: 'muito-elevado',
      label: 'Muito elevado',
      tone: 'critical',
      action:
        'Gap osmolar muito elevado. Alta suspeita de álcool tóxico. Considere fomepizol ou etanol IV, hemodiálise se acidose grave e dosagem dos níveis específicos.',
    },
  },
};
