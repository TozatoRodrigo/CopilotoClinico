import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/** Porte do `osmolaridade` do ANY. Mesma conta (uma casa) e faixas; ações como sugestão. */
export const OSMOLARIDADE: FormulaCalculator = {
  kind: 'formula',
  id: 'osmolaridade',
  name: 'Osmolaridade Sérica Calculada',
  aliases: ['osmolaridade', 'osmolalidade', 'gap osmótico', 'gap osmolar', 'intóxicação'],
  category: 'Renal / Metabólico',
  description: 'Calcula a osmolaridade sérica e o gap osmolar.',
  reference: {
    why: 'Gap osmolar elevado sugere a presença de osmol não medido (metanol, etilenoglicol, etanol).',
    whenToUse: 'Suspeita de intoxicação por álcool tóxico, avaliação de distúrbios osmolares.',
    pearlsPitfalls: [
      'Fórmula: 2 × Na + glicose/18 + ureia/6 (em mg/dL).',
      'Gap osmolar = osmolaridade medida - osmolaridade calculada.',
      'Gap > 10 mOsm/kg: considere álcool tóxico (metanol, etilenoglicol).',
      'O etanol contribui: cada 100 mg/dL de etanol = ~22 mOsm.',
      'Acidose metabólica com AG elevado + gap osmolar elevado = intoxicação por álcool tóxico até que se prove o contrário.',
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
    { id: 'na', label: 'Sódio', unit: 'mEq/L', min: 100, max: 180, step: 1 },
    { id: 'glucose', label: 'Glicose', unit: 'mg/dL', min: 20, max: 1000, step: 1 },
    { id: 'urea', label: 'Ureia', unit: 'mg/dL', min: 1, max: 300, step: 1 },
  ],
  decimals: 1,
  unit: 'mOsm/L',
  compute: (values) =>
    Math.round(
      (2 * requireValue(values, 'na') +
        requireValue(values, 'glucose') / 18 +
        requireValue(values, 'urea') / 6) *
        10,
    ) / 10,
  interpretation: {
    bands: [
      {
        id: 'hipoosmolar',
        upTo: { value: 275, inclusive: false },
        label: 'Hipo-osmolar',
        tone: 'attention',
        action:
          'Osmolaridade abaixo do normal (275–295). Considere investigar a causa da hiponatremia/hipo-osmolaridade.',
      },
      {
        id: 'normal',
        upTo: { value: 295, inclusive: true },
        label: 'Normal',
        tone: 'neutral',
        action: 'Osmolaridade dentro da faixa normal (275–295 mOsm/L).',
      },
    ],
    otherwise: {
      id: 'hiperosmolar',
      label: 'Hiperosmolar',
      tone: 'critical',
      action:
        'Osmolaridade elevada. Considere calcular o gap osmolar (medida - calculada); gap > 10 sugere álcool tóxico.',
    },
  },
};
