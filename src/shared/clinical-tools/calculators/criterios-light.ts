import { requireValue, type FormulaCalculator } from '../calculator';
import { formatDecimal } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

function ratio(values: Readonly<Record<string, number>>, top: string, bottom: string): number {
  return requireValue(values, top) / requireValue(values, bottom);
}

/**
 * Porte do `critériosLight` do ANY. Mesma contagem dos três critérios (com
 * ">" estrito, como lá); as razões saem como detalhe, com 2 casas, e as ações
 * viraram sugestão.
 */
export const CRITERIOS_LIGHT: FormulaCalculator = {
  kind: 'formula',
  id: 'criterios-light',
  name: 'Critérios de Light',
  aliases: [
    'light',
    'derrame pleural',
    'transudato',
    'exsudato',
    'liquido pleural',
    'toracocentese',
  ],
  category: 'Respiratório / Sepse',
  description: 'Diferenciação entre transudato e exsudato pleural (critérios de Light).',
  reference: {
    why: 'Classificar o derrame pleural como transudato ou exsudato direciona a investigação etiológica.',
    whenToUse: 'Após toracocentese diagnóstica, para classificar o líquido pleural.',
    pearlsPitfalls: [
      'Exsudato se QUALQUER critério positivo: (1) proteína LP/soro > 0,5; (2) LDH LP/soro > 0,6; (3) LDH LP > 2/3 do limite superior do normal sérico.',
      'Se nenhum critério positivo: transudato.',
      'Sensibilidade ~98% para exsudato, mas especificidade ~77%: pode classificar transudatos como exsudatos.',
      'Transudato em uso de diurético pode ser falsamente classificado como exsudato.',
      'Gradiente de albumina soro-LP > 1,2 sugere transudato (complementar na dúvida).',
    ],
    citation:
      'Light RW et al. Pleural effusions: the diagnostic separation of transudates and exudates. Ann Intern Med. 1972;77(4):507-13.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    {
      id: 'prot_lp',
      label: 'Proteína do líquido pleural',
      unit: 'g/dL',
      min: 0.1,
      max: 10,
      step: 0.1,
    },
    { id: 'prot_serum', label: 'Proteína sérica', unit: 'g/dL', min: 1, max: 15, step: 0.1 },
    { id: 'ldh_lp', label: 'LDH do líquido pleural', unit: 'U/L', min: 10, max: 10000, step: 1 },
    { id: 'ldh_serum', label: 'LDH sérico', unit: 'U/L', min: 10, max: 5000, step: 1 },
    {
      id: 'ldh_upper',
      label: 'Limite superior normal do LDH sérico',
      unit: 'U/L',
      min: 100,
      max: 500,
      step: 1,
      defaultValue: 250,
    },
  ],
  decimals: 0,
  formatValue: (value) => `${value} de 3 critérios`,
  compute: (values) => {
    const protein = ratio(values, 'prot_lp', 'prot_serum') > 0.5 ? 1 : 0;
    const ldh = ratio(values, 'ldh_lp', 'ldh_serum') > 0.6 ? 1 : 0;
    const ldhUpper = requireValue(values, 'ldh_lp') > (2 / 3) * requireValue(values, 'ldh_upper');
    return protein + ldh + (ldhUpper ? 1 : 0);
  },
  details: (_value, values) => [
    { label: 'Proteína LP/soro', value: formatDecimal(ratio(values, 'prot_lp', 'prot_serum'), 2) },
    { label: 'LDH LP/soro', value: formatDecimal(ratio(values, 'ldh_lp', 'ldh_serum'), 2) },
  ],
  interpretation: {
    bands: [
      {
        id: 'transudato',
        upTo: { value: 0, inclusive: true },
        label: 'Transudato',
        tone: 'neutral',
        action:
          'Nenhum critério de Light positivo. Causas comuns: IC, cirrose, síndrome nefrótica.',
      },
    ],
    otherwise: {
      id: 'exsudato',
      label: 'Exsudato',
      tone: 'attention',
      action:
        'Considere investigar a causa (infecção, neoplasia, TEP, colagenose, pancreatite). Se houver suspeita de transudato classificado erroneamente, considere o gradiente de albumina soro-LP.',
    },
  },
};
