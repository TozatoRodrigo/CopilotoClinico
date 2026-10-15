import { byRule, requireValue, type FormulaCalculator } from '../calculator';
import { formatCompact } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `fórmulaWinters` do ANY. Mesma pCO2 esperada (1,5 × HCO3 + 8, uma
 * casa) e a faixa por regra: a pCO2 medida dentro de ±2 é compensação
 * adequada, acima é acidose respiratória e abaixo é alcalose respiratória. A
 * faixa ±2 é feita com a mesma aritmética de lá (o limite sai do valor já
 * arredondado).
 */
export const FORMULA_WINTERS: FormulaCalculator = {
  kind: 'formula',
  id: 'formula-winters',
  name: 'Fórmula de Winters',
  aliases: [
    'winters',
    'pco2 esperada',
    'compensacao respiratoria',
    'acidose metabólica',
    'gasometria',
  ],
  category: 'Hemodinâmica',
  description: 'Calcula a pCO2 esperada na compensação respiratória da acidose metabólica.',
  reference: {
    why: 'Permite identificar distúrbio respiratório concomitante em pacientes com acidose metabólica.',
    whenToUse:
      'Pacientes com acidose metabólica primária, para verificar se a compensação respiratória é adequada.',
    pearlsPitfalls: [
      'pCO2 esperada = 1,5 × HCO3 + 8 (± 2).',
      'Se pCO2 medida > esperada: acidose respiratória concomitante.',
      'Se pCO2 medida < esperada: alcalose respiratória concomitante.',
      'Só é válida para acidose metabólica primária.',
      'O limite inferior da pCO2 compensatória é ~10 mmHg.',
    ],
    citation: 'Winters RW et al. The body fluids in pediatrics. Little, Brown & Co; 1973.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'hco3', label: 'Bicarbonato (HCO3)', unit: 'mEq/L', min: 1, max: 50, step: 0.1 },
    { id: 'pco2', label: 'pCO2 medida (gasometria)', unit: 'mmHg', min: 5, max: 120, step: 0.1 },
  ],
  decimals: 1,
  unit: 'mmHg',
  compute: (values) => Math.round((1.5 * requireValue(values, 'hco3') + 8) * 10) / 10,
  details: (value) => [
    {
      label: 'Faixa esperada',
      value: `${formatCompact(value - 2, 1)}–${formatCompact(value + 2, 1)} mmHg`,
    },
  ],
  interpretation: byRule(
    [
      {
        id: 'adequada',
        label: 'Compensação adequada',
        tone: 'neutral',
        action:
          'pCO2 medida dentro da faixa esperada. Acidose metabólica simples com compensação respiratória adequada.',
      },
      {
        id: 'acidose-respiratoria',
        label: 'Acidose respiratória concomitante',
        tone: 'critical',
        action:
          'pCO2 medida acima do esperado: acidose respiratória concomitante. Considere investigar a causa respiratória.',
      },
      {
        id: 'alcalose-respiratoria',
        label: 'Alcalose respiratória concomitante',
        tone: 'attention',
        action: 'pCO2 medida abaixo do esperado: alcalose respiratória concomitante.',
      },
    ],
    (value, values) => {
      const pco2 = requireValue(values, 'pco2');
      const lower = value - 2;
      const upper = value + 2;
      if (pco2 >= lower && pco2 <= upper) return 'adequada';
      return pco2 > upper ? 'acidose-respiratoria' : 'alcalose-respiratoria';
    },
  ),
};
