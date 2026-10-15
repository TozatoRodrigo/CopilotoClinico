import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/** Porte do `pam` do ANY. Mesma conta ((2 × PAD + PAS) / 3, inteira) e faixas; ações como sugestão. */
export const PAM: FormulaCalculator = {
  kind: 'formula',
  id: 'pam',
  name: 'Pressão Arterial Média (PAM)',
  aliases: ['pam', 'pressão arterial média', 'map', 'mean arterial pressure'],
  category: 'Hemodinâmica',
  description: 'Cálculo da pressão arterial média: (2 × PAD + PAS) / 3.',
  reference: {
    why: 'A PAM é o principal determinante da perfusão orgânica. Meta terapêutica no choque séptico e no paciente neurológico.',
    whenToUse: 'Todo paciente crítico, para guiar metas hemodinâmicas.',
    pearlsPitfalls: [
      'Meta geral: PAM ≥ 65 mmHg (Surviving Sepsis Campaign).',
      'Neuro: PAM ≥ 80–85 mmHg em HSA com vasoespasmo.',
      'PAM < 60 mmHg = perfusão orgânica comprometida.',
      'Monitoramento invasivo (cateter arterial) é mais preciso que o auscultatório no choque.',
    ],
    citation: 'Surviving Sepsis Campaign 2021. Intensive Care Med. 2021;47(11):1181-247.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'sbp', label: 'Pressão arterial sistólica', unit: 'mmHg', min: 40, max: 300, step: 1 },
    { id: 'dbp', label: 'Pressão arterial diastólica', unit: 'mmHg', min: 20, max: 200, step: 1 },
  ],
  decimals: 0,
  unit: 'mmHg',
  compute: (values) =>
    Math.round((2 * requireValue(values, 'dbp') + requireValue(values, 'sbp')) / 3),
  interpretation: {
    bands: [
      {
        id: 'hipoperfusao',
        upTo: { value: 60, inclusive: false },
        label: 'Hipoperfusão',
        tone: 'critical',
        action:
          'Abaixo do limiar de perfusão orgânica. Considere vasopressores e reposição volêmica.',
      },
      {
        id: 'limitrofe',
        upTo: { value: 65, inclusive: false },
        label: 'Limítrofe',
        tone: 'attention',
        action: 'Próximo ao limiar mínimo. Considere monitorar e intervir.',
      },
      {
        id: 'adequada',
        upTo: { value: 100, inclusive: true },
        label: 'Adequada',
        tone: 'neutral',
        action: 'PAM dentro da meta terapêutica (≥ 65 mmHg).',
      },
    ],
    otherwise: {
      id: 'elevada',
      label: 'Elevada',
      tone: 'attention',
      action: 'PAM elevada. Considere avaliar a necessidade de controle pressórico.',
    },
  },
};
