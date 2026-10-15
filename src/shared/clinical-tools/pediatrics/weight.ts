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
 * De onde vem o peso da criança (CC-319). Só o peso digitado é aferido; a cor
 * de Broselow é estimativa e a tela marca como "estimado". Peso fora de 0,5 a
 * 50 kg é erro e nada é calculado (ADR-017).
 */

export const PEDIATRIC_WEIGHT_RANGE: NumericRange = WEIGHT_RANGES.pediatrico;
export const AGE_RANGE: NumericRange = { min: 0, max: 18, unit: 'anos' };

/** Abaixo disso o ANY mostra o alerta de neonato. */
export const NEONATAL_WEIGHT_LIMIT_KG = 3;

export type WeightSource = 'medido' | 'broselow';

export const WEIGHT_SOURCE_LABEL: Record<WeightSource, string> = {
  medido: 'peso aferido',
  broselow: 'estimado pela cor de Broselow',
};

export interface PediatricInputs {
  /** Peso digitado (kg), com vírgula ou ponto. */
  weight: string;
  /** Cor de Broselow escolhida na fita. */
  broselow: BroselowKey | null;
  /** Idade digitada (anos, aceita fração: 0,5 = 6 meses). */
  age: string;
}

export type WeightResolution =
  | { status: 'vazio' }
  | { status: 'invalido'; field: 'peso'; error: NumericFieldError }
  | {
      status: 'pronto';
      kg: number;
      source: WeightSource;
      /** Tudo que não é peso aferido é estimativa. */
      estimated: boolean;
      /** Cor escolhida ou, com peso aferido, a cor mais próxima do peso. */
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

function readWeight(inputs: PediatricInputs): WeightResolution {
  if (inputs.weight.trim() !== '') {
    const checked = validateNumber(inputs.weight, PEDIATRIC_WEIGHT_RANGE);
    if (!checked.ok) return { status: 'invalido', field: 'peso', error: checked.error };
    return ready(checked.value, 'medido', broselowColorForWeight(checked.value));
  }
  const color = inputs.broselow ? findBroselowColor(inputs.broselow) : undefined;
  if (color) return ready(color.weightKg, 'broselow', color);
  return { status: 'vazio' };
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
