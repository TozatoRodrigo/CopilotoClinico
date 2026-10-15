import { byRule, requireValue, type FormulaCalculator } from '../calculator';
import { formatCompact } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/** Gradiente esperado para a idade, arredondado como no ANY: idade/4 + 4. */
function expectedForAge(values: Readonly<Record<string, number>>): number {
  return Math.round(requireValue(values, 'age') / 4 + 4);
}

/**
 * Porte do `gradienteAa` do ANY. Mesma conta (Patm 760, PH2O 47, QR 0,8, uma
 * casa) e a faixa por regra: normal até o esperado para a idade. FiO₂ abre em
 * 21%, como lá.
 */
export const GRADIENTE_AA: FormulaCalculator = {
  kind: 'formula',
  id: 'gradiente-aa',
  name: 'Gradiente Alvéolo-Arterial (A-a)',
  aliases: ['gradiente', 'a-a', 'pao2', 'alveolar', 'hipoxemia', 'gasometria'],
  category: 'Hemodinâmica',
  description: 'Diferença entre O2 alveolar e arterial: identifica a causa da hipoxemia.',
  reference: {
    why: 'Diferencia hipoxemia por hipoventilação (gradiente normal) de shunt/distúrbio V/Q (gradiente elevado).',
    whenToUse:
      'Pacientes com hipoxemia, para identificar a causa: hipoventilação, shunt ou distúrbio V/Q.',
    pearlsPitfalls: [
      'PAO2 = FiO₂ × (Patm - PH2O) - PaCO2/QR. Usar Patm = 760, PH2O = 47, QR = 0,8.',
      'Gradiente normal esperado: (idade/4) + 4 mmHg (aproximação).',
      'Gradiente elevado com FiO₂ 100% que não corrige = shunt verdadeiro.',
      'Não aplicável se o paciente estiver em ventilação mecânica com FiO₂ > 60% (impreciso).',
    ],
    citation:
      'Respiratory physiology principles. Ref: West JB. Respiratory Physiology: The Essentials. 10th ed.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'fio2', label: 'FiO₂', unit: '%', min: 21, max: 100, step: 1, defaultValue: 21 },
    { id: 'paco2', label: 'PaCO2', unit: 'mmHg', min: 10, max: 120, step: 0.1 },
    { id: 'pao2', label: 'PaO₂', unit: 'mmHg', min: 20, max: 600, step: 0.1 },
    { id: 'age', label: 'Idade', unit: 'anos', min: 18, max: 120, step: 1 },
  ],
  decimals: 1,
  unit: 'mmHg',
  compute: (values) => {
    const alveolar =
      (requireValue(values, 'fio2') / 100) * (760 - 47) - requireValue(values, 'paco2') / 0.8;
    const gradient = alveolar - requireValue(values, 'pao2');
    return Math.round(gradient * 10) / 10;
  },
  details: (_value, values) => [
    { label: 'Esperado para a idade', value: `~${formatCompact(expectedForAge(values))} mmHg` },
  ],
  interpretation: byRule(
    [
      {
        id: 'normal',
        label: 'Normal para a idade',
        tone: 'neutral',
        action:
          'Hipoxemia por hipoventilação (se presente). Considere causas centrais ou neuromusculares.',
      },
      {
        id: 'elevado',
        label: 'Elevado',
        tone: 'critical',
        action: 'Gradiente elevado sugere shunt, distúrbio V/Q ou comprometimento da difusão.',
      },
    ],
    (value, values) => (value <= expectedForAge(values) ? 'normal' : 'elevado'),
  ),
};
