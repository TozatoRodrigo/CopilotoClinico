import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `abc2` do ANY. Mesma conta, sem arredondar antes da faixa (como
 * lá): 29,96 mL aparece como "30,0 mL" e cai em "moderado". A faixa
 * "grande" usa o laranja do ANY, que aqui vira atenção. O "(cm)" saiu do
 * rótulo porque o campo já mostra a unidade.
 */
export const ABC2: FormulaCalculator = {
  kind: 'formula',
  id: 'abc2',
  name: 'Volume do hematoma (ABC/2)',
  aliases: ['abc', 'volume hematoma', 'avch volume', 'calculo hematoma', 'abc/2'],
  category: 'Neurologia',
  description: 'Estimativa rápida do volume de hematoma intracerebral pela TC.',
  reference: {
    why: 'Método padrão para estimar o volume do hematoma sem software de volumetria. Necessário para o ICH Score (limiar de 30 mL). Amplamente validado e aceito nas diretrizes AHA/ASA.',
    whenToUse: 'Qualquer hemorragia intracerebral na TC. Medir nos cortes axiais.',
    pearlsPitfalls: [
      'A = maior diâmetro do hematoma no corte com maior área (cm).',
      'B = maior diâmetro perpendicular a A, no mesmo corte (cm).',
      'C = número de cortes com hematoma × espessura do corte (cm). Alternativa: contar cortes onde o hematoma ocupa > 75% da área (conta como 1) e > 25% (conta como 0,5).',
      'Tende a superestimar hematomas irregulares e subestimar os regulares.',
      'Repetir em TC de controle (6–24 h) para avaliar expansão (aumento > 33% ou > 6 mL é significativo).',
      'Para hematomas subdurais ou epidurais, usar fórmulas específicas.',
    ],
    citation:
      'Kothari RU et al. The ABCs of measuring intracerebral hemorrhage volumes. Stroke. 1996;27(8):1304-5.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'a_cm', label: 'A — maior diâmetro', unit: 'cm', min: 0.1, max: 15, step: 0.1 },
    { id: 'b_cm', label: 'B — perpendicular a A', unit: 'cm', min: 0.1, max: 15, step: 0.1 },
    { id: 'c_cm', label: 'C — profundidade', unit: 'cm', min: 0.1, max: 15, step: 0.1 },
  ],
  decimals: 1,
  unit: 'mL',
  compute: (values) =>
    (requireValue(values, 'a_cm') * requireValue(values, 'b_cm') * requireValue(values, 'c_cm')) /
    2,
  interpretation: {
    bands: [
      {
        id: 'pequeno',
        upTo: { value: 10, inclusive: false },
        label: 'Pequeno',
        tone: 'neutral',
        action:
          'Hematoma pequeno (< 10 mL); no ICH Score, entra como "< 30 mL". Considere monitorização e controle pressórico.',
      },
      {
        id: 'moderado',
        upTo: { value: 30, inclusive: false },
        label: 'Moderado',
        tone: 'attention',
        action:
          'Hematoma moderado (10–29 mL); no ICH Score, entra como "< 30 mL". Considere TC de controle em 6 h para avaliar expansão.',
      },
      {
        id: 'grande',
        upTo: { value: 60, inclusive: false },
        label: 'Grande',
        tone: 'attention',
        action:
          'Hematoma grande (≥ 30 mL); no ICH Score, entra como "≥ 30 mL". Considere neurocirurgia se cerebelar > 3 cm ou deterioração neurológica.',
      },
    ],
    otherwise: {
      id: 'muito-grande',
      label: 'Muito grande',
      tone: 'critical',
      action:
        'Hematoma muito grande (≥ 60 mL). Prognóstico reservado. Considere discutir os objetivos de cuidado.',
    },
  },
};
