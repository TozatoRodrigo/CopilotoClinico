import { byRule, requireValue, type FormulaCalculator, type NumericInput } from '../calculator';
import { yesNoItem } from '../calculators/items';
import { formatCompact } from '../numbers';
import { TEP_PROVENANCE } from './provenance';

/**
 * D-dímero no TEP (CC-318): ajustado à idade, YEARS e YEARS adaptado à
 * gestação. As três leem o mesmo número contra um ponto de corte; muda só de
 * onde o ponto de corte sai. Contas do `TepGuide.tsx` do ANY
 * (`calcDdimerThreshold` e o `cnt >= 1 ? 500 : 1000` repetido em cada YEARS).
 */

/**
 * Idade em anos completos: o ANY lia o campo com `parseInt`, então 65,9
 * anos contava como 65.
 */
function wholeYears(age: number): number {
  return Math.trunc(age);
}

/** Ponto de corte ajustado à idade: idade × 10 µg/L a partir dos 50 anos; abaixo, 500. */
export function ageAdjustedDDimerCutoff(age: number): number {
  const years = wholeYears(age);
  return years >= 50 ? years * 10 : 500;
}

/** Ponto de corte do YEARS (e do YEARS na gestação): 500 µg/L com ≥ 1 critério, 1000 sem nenhum. */
export function yearsDDimerCutoff(criteria: number): number {
  return criteria >= 1 ? 500 : 1000;
}

export const D_DIMER_UNIT = 'µg/L FEU';

function formatCutoff(cutoff: number): string {
  return `${formatCompact(cutoff)} ${D_DIMER_UNIT}`;
}

/**
 * O ANY não limitava o campo. O mínimo de 10 µg/L recusa o valor digitado em
 * µg/mL ou mg/L (0,5 no lugar de 500), que cairia abaixo de qualquer ponto de
 * corte e viraria "TEP improvável" (achado em revisao-clinica/tep.md).
 */
const D_DIMER_INPUT: NumericInput = {
  id: 'd-dimer',
  label: 'D-dímero',
  unit: D_DIMER_UNIT,
  min: 10,
  max: 100000,
  step: 1,
};

const AGE_INPUT: NumericInput = {
  id: 'age',
  label: 'Idade',
  unit: 'anos',
  min: 18,
  max: 120,
  step: 1,
};

const YEARS_ITEMS = [
  yesNoItem('dvt-signs', 'Sinais clínicos de TVP'),
  yesNoItem('hemoptysis', 'Hemoptise'),
  yesNoItem('pe-likely', 'TEP como diagnóstico mais provável'),
];

function yearsCriteria(values: Readonly<Record<string, number>>): number {
  return YEARS_ITEMS.reduce((sum, item) => sum + requireValue(values, item.id), 0);
}

function yearsDetails(values: Readonly<Record<string, number>>) {
  const criteria = yearsCriteria(values);
  return [
    { label: 'Critérios YEARS', value: `${criteria} de 3` },
    { label: 'Ponto de corte', value: formatCutoff(yearsDDimerCutoff(criteria)) },
  ];
}

const IMAGING = 'Imagem recomendada: CTPA (preferida) ou V/Q se contraindicação a contraste.';

export const D_DIMER_AGE_ADJUSTED: FormulaCalculator = {
  kind: 'formula',
  id: 'd-dimero-idade',
  name: 'D-dímero ajustado por idade',
  aliases: ['d-dímero', 'ddimero', 'dimero', 'adjust-pe', 'tep'],
  category: 'Tromboembolismo pulmonar',
  description: 'Ponto de corte do D-dímero pela idade: idade × 10 µg/L a partir dos 50 anos.',
  reference: {
    why: 'Ajusta o ponto de corte do D-dímero à idade a partir dos 50 anos.',
    whenToUse:
      'No roteiro: Wells baixo com PERC positivo, ou Wells intermediário, fora da gestação.',
    pearlsPitfalls: [
      'Ponto de corte = idade × 10 µg/L (FEU). Aplicável para idade ≥ 50 anos; abaixo, usar 500 µg/L.',
      'D-dímero e YEARS não foram validados em pacientes em anticoagulação terapêutica.',
    ],
    citation:
      'Righini M, Van Es J, Den Exter PL, et al. Age-adjusted D-dimer cutoff levels to rule out pulmonary embolism: the ADJUST-PE study. JAMA. 2014;311(11):1117-24.',
  },
  provenance: TEP_PROVENANCE,
  inputs: [AGE_INPUT, D_DIMER_INPUT],
  decimals: 0,
  unit: D_DIMER_UNIT,
  compute: (values) => requireValue(values, 'd-dimer'),
  interpretation: byRule(
    [
      {
        id: 'negativo',
        label: 'D-dímero negativo',
        tone: 'neutral',
        action: 'TEP improvável.',
      },
      { id: 'positivo', label: 'D-dímero positivo', tone: 'critical', action: IMAGING },
    ],
    (value, values) =>
      value < ageAdjustedDDimerCutoff(requireValue(values, 'age')) ? 'negativo' : 'positivo',
  ),
  details: (_value, values) => {
    const age = requireValue(values, 'age');
    return [
      {
        label: 'Ponto de corte ajustado',
        value: `${formatCutoff(ageAdjustedDDimerCutoff(age))} (idade ${formatCompact(wholeYears(age))} anos)`,
      },
    ];
  },
};

export const YEARS: FormulaCalculator = {
  kind: 'formula',
  id: 'years',
  name: 'Algoritmo YEARS',
  aliases: ['years', 'd-dímero', 'tep', 'embolia pulmonar'],
  category: 'Tromboembolismo pulmonar',
  description: 'Três critérios clínicos definem o ponto de corte do D-dímero: 500 ou 1000 µg/L.',
  reference: {
    why: 'Os critérios YEARS definem o ponto de corte do D-dímero: 1000 µg/L sem nenhum critério, 500 µg/L com pelo menos um.',
    whenToUse:
      'No roteiro: Wells baixo com PERC positivo, ou Wells intermediário, fora da gestação.',
    pearlsPitfalls: [
      'Se ≥ 1 critério YEARS: ponto de corte do D-dímero = 500 µg/L. Se nenhum: 1000 µg/L.',
      'D-dímero e YEARS não foram validados em pacientes em anticoagulação terapêutica.',
    ],
    citation:
      'van der Hulle T, Cheung WY, Kooij S, et al. Simplified diagnostic management of suspected pulmonary embolism (the YEARS study): a prospective, multicentre, cohort study. Lancet. 2017;390(10091):289-297.',
  },
  provenance: TEP_PROVENANCE,
  inputs: [D_DIMER_INPUT],
  items: YEARS_ITEMS,
  decimals: 0,
  unit: D_DIMER_UNIT,
  compute: (values) => requireValue(values, 'd-dimer'),
  interpretation: byRule(
    [
      { id: 'negativo', label: 'YEARS negativo', tone: 'neutral', action: 'TEP improvável.' },
      { id: 'positivo', label: 'YEARS positivo', tone: 'critical', action: IMAGING },
    ],
    (value, values) => (value < yearsDDimerCutoff(yearsCriteria(values)) ? 'negativo' : 'positivo'),
  ),
  details: (_value, values) => yearsDetails(values),
};

export const YEARS_PREGNANCY: FormulaCalculator = {
  kind: 'formula',
  id: 'years-gestacao',
  name: 'YEARS adaptado para gestantes',
  aliases: ['years', 'gestante', 'gestação', 'gravidez', 'tep', 'd-dímero'],
  category: 'Tromboembolismo pulmonar',
  description: 'YEARS na gestação: os mesmos critérios e pontos de corte, com USG de MMII antes.',
  reference: {
    why: 'Adaptação do YEARS para a gestação, com USG de MMII antes da imagem.',
    whenToUse: 'Gestante com suspeita de TEP (COR 2b).',
    pearlsPitfalls: [
      'Adaptação para gestação (COR 2b). Ponto de corte do D-dímero de 1000 µg/L se sem critérios YEARS; 500 µg/L com ≥ 1.',
      'Se sintomas em MMII + USG compressão positiva → pode tratar com anticoagulação sem necessidade de CTPA. Essa abordagem evita 65% das CTPAs no 1º trimestre.',
    ],
    citation:
      'van der Pol LM, Tromeur C, Bistervels IM, et al. Pregnancy-Adapted YEARS Algorithm for Diagnosis of Suspected Pulmonary Embolism. N Engl J Med. 2019;380(12):1139-1149.',
  },
  provenance: TEP_PROVENANCE,
  inputs: [D_DIMER_INPUT],
  items: YEARS_ITEMS,
  decimals: 0,
  unit: D_DIMER_UNIT,
  compute: (values) => requireValue(values, 'd-dimer'),
  interpretation: byRule(
    [
      {
        id: 'negativo',
        label: 'YEARS gestante negativo',
        tone: 'neutral',
        action: 'TEP improvável. Considere diagnósticos alternativos.',
      },
      {
        id: 'positivo',
        label: 'YEARS gestante positivo',
        tone: 'critical',
        action: 'Imagem necessária: CTPA ou V/Q. Se sintomas em MMII, considere USG antes.',
      },
    ],
    (value, values) => (value < yearsDDimerCutoff(yearsCriteria(values)) ? 'negativo' : 'positivo'),
  ),
  details: (_value, values) => yearsDetails(values),
};
