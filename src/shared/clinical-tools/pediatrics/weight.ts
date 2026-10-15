import {
  validateNumber,
  WEIGHT_RANGES,
  type NumericFieldError,
  type NumericRange,
} from '../ranges';
import {
  broselowColorForWeight,
  findBroselowColor,
  type BroselowColor,
  type BroselowKey,
} from './broselow';

/**
 * De onde vem o peso da criança (CC-319 e CC-320). Só o peso digitado é
 * aferido; a cor de Broselow, o comprimento e a idade dão estimativa, e a tela
 * marca como "estimado". Peso fora de 0,5 a 50 kg é erro e nada é calculado
 * (ADR-017).
 *
 * Quando há mais de uma fonte, vale a melhor: peso aferido, depois a cor
 * escolhida na fita, o comprimento e, por último, a idade. A primeira fonte
 * preenchida decide: se ela estiver fora da faixa, o resultado é erro, e não
 * a próxima fonte em silêncio.
 */

export const PEDIATRIC_WEIGHT_RANGE: NumericRange = WEIGHT_RANGES.pediatrico;
export const AGE_RANGE: NumericRange = { min: 0, max: 18, unit: 'anos' };
/** Alcance da tabela de comprimento do HETRIN Ped. */
export const LENGTH_RANGE: NumericRange = { min: 40, max: 160, unit: 'cm' };

/** Abaixo disso o ANY mostra o alerta de neonato. */
export const NEONATAL_WEIGHT_LIMIT_KG = 3;

export type WeightSource = 'medido' | 'broselow' | 'comprimento' | 'idade';

export const WEIGHT_SOURCE_LABEL: Record<WeightSource, string> = {
  medido: 'peso aferido',
  broselow: 'estimado pela cor de Broselow',
  comprimento: 'estimado pelo comprimento',
  idade: 'estimado pela idade (APLS)',
};

/**
 * Peso pelo comprimento (CC-320): as 29 faixas do HETRIN Ped e do Ped Guide
 * legado, em cm inteiros. `[mínimo, máximo, peso em kg, máximo exclusivo]`.
 */
export const LENGTH_WEIGHT_BANDS: readonly (readonly [number, number, number, boolean])[] = [
  [40, 48, 3, true],
  [48, 55, 4, true],
  [55, 59, 5, false],
  [60, 63, 6, false],
  [64, 66, 7, false],
  [67, 70, 8, false],
  [71, 74, 9, false],
  [75, 78, 10, false],
  [79, 83, 11, false],
  [84, 87, 12, false],
  [88, 91, 13, false],
  [92, 94, 14, false],
  [95, 98, 15, false],
  [99, 101, 16, false],
  [102, 104, 17, false],
  [105, 108, 18, false],
  [109, 112, 19, false],
  [113, 116, 20, false],
  [117, 121, 22, false],
  [122, 124, 24, false],
  [125, 127, 26, false],
  [128, 130, 28, false],
  [131, 133, 30, false],
  [134, 137, 32, false],
  [138, 140, 34, false],
  [141, 143, 36, false],
  [144, 150, 40, true],
  [150, 155, 45, true],
  [155, 160, 50, false],
];

/** Peso estimado pelo comprimento; o HETRIN arredonda o cm antes de procurar a faixa. */
export function estimateWeightFromLength(cm: number): number | null {
  const rounded = Math.round(cm);
  for (const [min, max, kg, maxExclusive] of LENGTH_WEIGHT_BANDS) {
    if (rounded >= min && (maxExclusive ? rounded < max : rounded <= max)) return kg;
  }
  return null;
}

/**
 * Peso estimado pela idade, como o HETRIN Ped (APLS atual; Luscombe acima de
 * 5 anos): abaixo de 1 ano (meses ÷ 2) + 4; de 1 a 5 anos 2 × idade + 8; acima
 * de 5 anos 3 × idade + 7. Arredondado ao kg e limitado a 0,5–50 kg.
 */
export function estimateWeightFromAge(years: number): number {
  let kg: number;
  if (years < 1) kg = (years * 12) / 2 + 4;
  else if (years <= 5) kg = 2 * years + 8;
  else kg = 3 * years + 7;
  kg = Math.round(kg);
  if (kg < PEDIATRIC_WEIGHT_RANGE.min) return PEDIATRIC_WEIGHT_RANGE.min;
  if (kg > PEDIATRIC_WEIGHT_RANGE.max) return PEDIATRIC_WEIGHT_RANGE.max;
  return kg;
}

export interface PediatricInputs {
  /** Peso digitado (kg), com vírgula ou ponto. */
  weight: string;
  /** Cor de Broselow escolhida na fita. */
  broselow: BroselowKey | null;
  /** Comprimento digitado (cm). */
  length: string;
  /** Idade digitada (anos, aceita fração: 0,5 = 6 meses). */
  age: string;
}

export type WeightField = 'peso' | 'comprimento' | 'idade';

export type WeightResolution =
  | { status: 'vazio' }
  | { status: 'invalido'; field: WeightField; error: NumericFieldError }
  | {
      status: 'pronto';
      kg: number;
      source: WeightSource;
      /** Tudo que não é peso aferido é estimativa. */
      estimated: boolean;
      /** Cor escolhida ou, nas outras fontes, a cor mais próxima do peso. */
      color: BroselowColor;
      neonatal: boolean;
    };

export type AgeResolution =
  | { status: 'vazio' }
  | { status: 'invalido'; error: NumericFieldError }
  | { status: 'pronto'; years: number; source: 'informada' | 'broselow' };

export interface PediatricPatient {
  weight: WeightResolution;
  age: AgeResolution;
}

function ready(kg: number, source: WeightSource, color: BroselowColor): WeightResolution {
  return {
    status: 'pronto',
    kg,
    source,
    estimated: source !== 'medido',
    color,
    neonatal: kg > 0 && kg < NEONATAL_WEIGHT_LIMIT_KG,
  };
}

function readWeight(inputs: PediatricInputs): WeightResolution {
  if (inputs.weight.trim() !== '') {
    const checked = validateNumber(inputs.weight, PEDIATRIC_WEIGHT_RANGE);
    if (!checked.ok) return { status: 'invalido', field: 'peso', error: checked.error };
    return ready(checked.value, 'medido', broselowColorForWeight(checked.value));
  }
  const color = inputs.broselow ? findBroselowColor(inputs.broselow) : undefined;
  if (color) return ready(color.weightKg, 'broselow', color);

  if (inputs.length.trim() !== '') {
    const checked = validateNumber(inputs.length, LENGTH_RANGE);
    if (!checked.ok) return { status: 'invalido', field: 'comprimento', error: checked.error };
    const kg = estimateWeightFromLength(checked.value);
    // A tabela cobre 40 a 160 cm sem buraco; null aqui seria erro de dado.
    if (kg === null) throw new Error(`Comprimento ${checked.value} cm fora da tabela de peso`);
    return ready(kg, 'comprimento', broselowColorForWeight(kg));
  }

  if (inputs.age.trim() !== '') {
    const checked = validateNumber(inputs.age, AGE_RANGE);
    if (!checked.ok) return { status: 'invalido', field: 'idade', error: checked.error };
    const kg = estimateWeightFromAge(checked.value);
    return ready(kg, 'idade', broselowColorForWeight(kg));
  }
  return { status: 'vazio' };
}

/**
 * Idade em uso: a digitada manda; sem ela, vale a idade da cor de Broselow
 * escolhida (como no PedGuide v4). Idade digitada fora de 0 a 18 anos é erro
 * e não cai para a da cor: as drogas que dependem de idade pedem correção.
 */
function readAge(inputs: PediatricInputs): AgeResolution {
  if (inputs.age.trim() !== '') {
    const checked = validateNumber(inputs.age, AGE_RANGE);
    return checked.ok
      ? { status: 'pronto', years: checked.value, source: 'informada' }
      : { status: 'invalido', error: checked.error };
  }
  const color = inputs.broselow ? findBroselowColor(inputs.broselow) : undefined;
  if (color) return { status: 'pronto', years: color.ageMonths / 12, source: 'broselow' };
  return { status: 'vazio' };
}

export function resolvePediatricPatient(inputs: PediatricInputs): PediatricPatient {
  return { weight: readWeight(inputs), age: readAge(inputs) };
}
