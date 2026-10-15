import type { FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { checkDum, DUM_INPUTS, formatGestationalAge, gestationalDays, trimesterOf } from './dum';

/**
 * Porte do `idadeGestacional` do ANY. Mesmo valor (dias desde a DUM até
 * hoje), escrito em semanas e dias; o trimestre sai como detalhe. Data
 * inexistente e DUM no futuro não calculam (`checkDum`).
 */
export const IDADE_GESTACIONAL: FormulaCalculator = {
  kind: 'formula',
  id: 'idade-gestacional',
  name: 'Idade gestacional por DUM',
  aliases: ['ig', 'idade gestacional', 'dum', 'data ultima menstruacao', 'semanas gestacao'],
  category: 'Obstetrícia',
  description:
    'Calcula a idade gestacional atual em semanas e dias a partir da data da última menstruação.',
  reference: {
    why: 'Estimativa rápida da idade gestacional para classificar o trimestre e planejar os cuidados.',
    whenToUse: 'Gestantes atendidas na emergência, para estimar rapidamente a idade gestacional.',
    pearlsPitfalls: [
      'Assume ciclos regulares de 28 dias.',
      'O ultrassom do primeiro trimestre é mais preciso que a DUM.',
      'Se a DUM for incerta, considerar a datação por ultrassonografia.',
      '< 14 semanas: primeiro trimestre. 14–28: segundo. > 28: terceiro.',
      'Termo: 37–41 semanas. Pós-termo: ≥ 42 semanas.',
    ],
    citation: 'Standard obstetric practice. ACOG Committee Opinion.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: DUM_INPUTS,
  decimals: 0,
  formatValue: formatGestationalAge,
  check: checkDum,
  compute: (values, context) => gestationalDays(values, context),
  details: (days) => [{ label: 'Trimestre', value: trimesterOf(days) }],
  interpretation: {
    bands: [],
    otherwise: {
      id: 'ig',
      label: 'Idade gestacional',
      tone: 'neutral',
      action: 'Considere confirmar com o ultrassom do primeiro trimestre se a DUM for incerta.',
    },
  },
};
