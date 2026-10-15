import { interpretValue } from '../calculator';
import { rawAnionGap } from '../calculators/anion-gap';
import { katzCorrectedSodium } from '../calculators/correcao-na';
import { freeWaterDeficitLiters } from '../calculators/deficit-agua';
import { DELTA_GAP, deltaRatio } from '../calculators/delta-gap';
import type { Consciousness, DkaSeverity, PotassiumBandId } from './content';

/**
 * Contas do roteiro de CAD e EHH (CC-326), porte do `ketoCalc.ts` do ANY.
 * Funções puras; o teste diferencial
 * (tests/clinical-tools/cad-ehh-differential.spec.ts) compara cada uma com a
 * referência congelada em 1.000 entradas aleatórias.
 *
 * Onde a mesma conta já existe nas calculadoras do motor, a função de lá é
 * reaproveitada (Katz, déficit de água livre, razão delta/delta, AG bruto).
 * Onde o KetoPath usa outra conta, fica a do KetoPath, e a diferença está em
 * docs/ferramentas/revisao-clinica/cad-ehh.md:
 * - ânion-gap inteiro e sem albumina (a calculadora corrige pela albumina e
 *   usa uma casa);
 * - sódio corrigido com fator fixo 2,0 (a calculadora abre em 1,6);
 * - osmolalidade efetiva sem ureia e inteira (a calculadora soma ureia/6);
 * - déficit de água livre com uma casa, fator por sexo e idade e sódio
 *   corrigido (a calculadora usa duas casas, fator escolhido e sódio medido).
 */

/** Fator do sódio corrigido no KetoPath ([UTD]); o ADA 2024 usa 1,6. */
export const KETO_SODIUM_FACTOR = 2.0;

/** AG = Na − (Cl + HCO₃), inteiro. Acima de 12 sugere acidose com AG elevado. [ADA] */
export function anionGap(sodium: number, chloride: number, bicarbonate: number): number {
  return Math.round(rawAnionGap(sodium, chloride, bicarbonate));
}

/**
 * Na corrigido = Na medido + 2,0 × (glicemia − 100) / 100, uma casa. Com
 * glicemia até 100 mg/dL devolve o sódio medido.
 */
export function correctedSodium(sodium: number, glucose: number): number {
  if (glucose <= 100) return Math.round(sodium * 10) / 10;
  return katzCorrectedSodium(sodium, glucose, KETO_SODIUM_FACTOR);
}

/** Osm efetiva = 2 × Na + glicemia / 18, inteira. Usa o sódio MEDIDO. */
export function effectiveOsmolality(sodium: number, glucose: number): number {
  return Math.round(2 * sodium + glucose / 18);
}

export type Sex = 'M' | 'F';

/** Água corporal total: fator 0,6 (homem) ou 0,5 (mulher), 0,5 e 0,45 no idoso. */
export function totalBodyWater(weightKg: number, sex: Sex, elderly: boolean): number {
  const factor = sex === 'M' ? (elderly ? 0.5 : 0.6) : elderly ? 0.45 : 0.5;
  return weightKg * factor;
}

/** Déficit = ACT × (Na corrigido / 140 − 1), em litros, uma casa. Só EHH e misto. */
export function freeWaterDeficit(
  weightKg: number,
  sex: Sex,
  elderly: boolean,
  correctedNa: number,
): number {
  const deficit = freeWaterDeficitLiters(totalBodyWater(weightKg, sex, elderly), correctedNa);
  return Math.round(deficit * 10) / 10;
}

/** Perdas no EHH: 100 a 220 mL/kg [JBDS], em litros com uma casa. */
export function hhsVolumeDeficit(weightKg: number): { min: number; max: number } {
  return {
    min: Math.round((weightKg * 100) / 100) / 10,
    max: Math.round((weightKg * 220) / 100) / 10,
  };
}

// ---- Gravidade da CAD ----

const SEVERITY_ORDER: Record<DkaSeverity, number> = { leve: 1, moderada: 2, grave: 3 };

function phAxis(ph: number): DkaSeverity | null {
  if (ph < 7.0) return 'grave';
  if (ph <= 7.25) return 'moderada';
  if (ph < 7.3) return 'leve';
  return null; // fora da faixa de acidose da CAD
}

function bicarbonateAxis(bicarbonate: number): DkaSeverity | null {
  if (bicarbonate < 10) return 'grave';
  if (bicarbonate < 15) return 'moderada';
  if (bicarbonate <= 18) return 'leve';
  return null;
}

function consciousnessAxis(consciousness: Consciousness): DkaSeverity {
  if (consciousness === 'estupor-coma') return 'grave';
  if (consciousness === 'sonolento') return 'moderada';
  return 'leve';
}

/**
 * Gravidade da CAD: o eixo mais grave manda (decisão do Gustavo, segundo o
 * ANY). A consciência só ESCALA: com pH e bicarbonato fora da faixa de
 * acidose, não há classificação — a CAD exige acidose (critério A).
 */
export function dkaSeverity(
  ph: number | null,
  bicarbonate: number | null,
  consciousness: Consciousness | null,
): DkaSeverity | null {
  const byPh = ph !== null ? phAxis(ph) : null;
  const byBicarbonate = bicarbonate !== null ? bicarbonateAxis(bicarbonate) : null;
  if (byPh === null && byBicarbonate === null) return null;
  const byConsciousness = consciousness !== null ? consciousnessAxis(consciousness) : null;
  const axes = [byPh, byBicarbonate, byConsciousness].filter(
    (axis): axis is DkaSeverity => axis !== null,
  );
  return axes.reduce((worst, axis) =>
    SEVERITY_ORDER[axis] > SEVERITY_ORDER[worst] ? axis : worst,
  );
}

// ---- Potássio ----

/** Faixa do potássio: < 3,5 baixo; até 5,0 (inclusive) alvo; acima, alto. [UTD] */
export function potassiumBand(potassium: number): PotassiumBandId {
  if (potassium < 3.5) return 'baixo';
  if (potassium <= 5.0) return 'alvo';
  return 'alto';
}

/**
 * Trava da insulina: sem potássio a seção não abre (critério de aceite do
 * CC-326); com potássio < 3,5 abre com o alerta de bloqueio, como no ANY.
 */
export type InsulinGate = 'sem-potassio' | 'bloqueada' | 'liberada';

export function insulinGate(potassium: number | null): InsulinGate {
  if (potassium === null) return 'sem-potassio';
  return potassium < 3.5 ? 'bloqueada' : 'liberada';
}

export interface KclPreparation {
  /** Volume de KCl a aspirar, em mL. */
  kclVolumeMl: number;
  /** Volume mínimo total para respeitar o limite de concentração da via. */
  minimumVolumeMl: number;
  /** Velocidade para entregar a dose no tempo previsto. */
  rateMlPerHour: number;
  /** A concentração resultante passa do limite da via. */
  exceedsLimit: boolean;
  /** mEq/L, inteiro. */
  resultingConcentration: number;
}

/**
 * Preparo de KCl, porte do `preparoKcl`.
 *
 * @param mEq dose desejada
 * @param mEqPerAmpoule 13,4 (KCl 10%) ou 25,6 (KCl 19,1%)
 * @param mlPerAmpoule 10 nas duas apresentações
 * @param maxMEqPerLiter 50 (periférica) ou 100 (central)
 * @param mEqPerHour velocidade de reposição
 * @param totalVolumeMl volume final escolhido; sem ele, usa o mínimo
 */
export function kclPreparation(
  mEq: number,
  mEqPerAmpoule: number,
  mlPerAmpoule: number,
  maxMEqPerLiter: number,
  mEqPerHour: number,
  totalVolumeMl?: number,
): KclPreparation {
  const kclVolumeMl = Math.round((mEq / mEqPerAmpoule) * mlPerAmpoule * 10) / 10;
  const minimumVolumeMl = Math.round((mEq / maxMEqPerLiter) * 1000);
  const volume = totalVolumeMl && totalVolumeMl > 0 ? totalVolumeMl : minimumVolumeMl;
  const hours = mEqPerHour > 0 ? mEq / mEqPerHour : 0;
  const resultingConcentration = volume > 0 ? Math.round((mEq / volume) * 1000) : 0;
  return {
    kclVolumeMl,
    minimumVolumeMl,
    rateMlPerHour: hours > 0 ? Math.round((volume / hours) * 10) / 10 : 0,
    exceedsLimit: resultingConcentration > maxMEqPerLiter,
    resultingConcentration,
  };
}

/** mEq de KCl contidos em 1 mL da apresentação. */
export function kclMEqPerMl(presentation: { mEqPerAmpoule: number; mlPerAmpoule: number }): number {
  return presentation.mEqPerAmpoule / presentation.mlPerAmpoule;
}

// ---- Insulina ----

/** Diluição 1 U/mL: U/h e mL/h são o mesmo número. Uma casa. */
export function insulinRate(weightKg: number, unitsPerKgHour: number): number {
  return Math.round(weightKg * unitsPerKgHour * 10) / 10;
}

export interface SubcutaneousTransition {
  totalDailyMin: number;
  totalDailyMax: number;
  basalMin: number;
  basalMax: number;
}

/**
 * Transição para insulina subcutânea: dose diária total 0,5–0,6 U/kg (0,3
 * com risco de hipoglicemia) e basal 0,15–0,3 U/kg, uma casa.
 */
export function subcutaneousTransition(
  weightKg: number,
  hypoglycemiaRisk: boolean,
): SubcutaneousTransition {
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    totalDailyMin: hypoglycemiaRisk ? round(weightKg * 0.3) : round(weightKg * 0.5),
    totalDailyMax: hypoglycemiaRisk ? round(weightKg * 0.3) : round(weightKg * 0.6),
    basalMin: round(weightKg * 0.15),
    basalMax: round(weightKg * 0.3),
  };
}

// ---- Ciclo de reavaliação ----

export type GlucoseFallReading = 'insuficiente' | 'adequada' | 'rapida';

export interface GlucoseFall {
  /** mg/dL por hora, inteiro. Positivo = caindo. Só confiável se `extrapolable`. */
  perHour: number;
  /** Variação absoluta entre as duas rodadas, inteira. */
  absolute: number;
  hours: number;
  reading: GlucoseFallReading;
  /**
   * Falso com intervalo curto demais para extrapolar por hora: 80 mg/dL em 1
   * minuto daria 4.800 mg/dL/h e um alarme falso de teto.
   */
  extrapolable: boolean;
}

/** Intervalo mínimo, em minutos, para estimar a queda por hora. */
export const MIN_EXTRAPOLATION_MINUTES = 15;

/**
 * Queda da glicemia entre duas rodadas, por hora. Abaixo de 50 mg/dL/h é
 * insuficiente; acima de 90, rápida (teto de 90–120 [UTD]).
 */
export function glucoseFall(
  current: number,
  previous: number,
  minutes: number,
): GlucoseFall | null {
  if (minutes <= 0) return null;
  const hours = minutes / 60;
  const absolute = previous - current;
  const perHour = absolute / hours;
  const extrapolable = minutes >= MIN_EXTRAPOLATION_MINUTES;
  const reading: GlucoseFallReading = !extrapolable
    ? 'adequada'
    : perHour < 50
      ? 'insuficiente'
      : perHour > 90
        ? 'rapida'
        : 'adequada';
  return {
    perHour: Math.round(perHour),
    absolute: Math.round(absolute),
    hours,
    reading,
    extrapolable,
  };
}

/**
 * Minutos entre o fechamento da rodada anterior e agora, como no ANY: ao
 * menos 1, arredondado.
 */
export function minutesSince(previousAt: number, now: number): number {
  return Math.max(1, Math.round((now - previousAt) / 60000));
}

/** Resolução da CAD sem BHB: pH ≥ 7,3 ou HCO₃ ≥ 18 (obrigatório); glicemia < 200 (desejável). */
export function dkaResolution(
  ph: number | null,
  bicarbonate: number | null,
  glucose: number | null,
): { required: boolean; desirable: boolean; resolved: boolean } {
  const required = (ph !== null && ph >= 7.3) || (bicarbonate !== null && bicarbonate >= 18);
  const desirable = glucose !== null && glucose < 200;
  return { required, desirable, resolved: required };
}

// ---- Delta/delta ----

export type DeltaDeltaReading = 'hipercloremica' | 'ag-puro' | 'alcalose';

export interface DeltaDelta {
  deltaGap: number;
  ratio: number;
  reading: DeltaDeltaReading;
}

const DELTA_BAND_READING: Record<string, DeltaDeltaReading> = {
  hipercloremica: 'hipercloremica',
  pura: 'ag-puro',
  alcalose: 'alcalose',
};

/**
 * Delta gap e razão delta/delta, a mesma conta e as mesmas faixas da
 * calculadora Delta Gap (AG normal 12, HCO₃ normal 24). Com bicarbonato
 * normal ou alto não se aplica (`null`).
 *
 * No roteiro, a razão abaixo de 1 responde se o bicarbonato baixo é o soro
 * infundido (acidose hiperclorêmica) e não CAD persistente — a armadilha que
 * atrasa a transição para a subcutânea.
 */
export function deltaDelta(anionGapValue: number, bicarbonate: number): DeltaDelta | null {
  if (24 - bicarbonate <= 0) return null;
  const ratio = deltaRatio(anionGapValue, bicarbonate);
  const band = interpretValue(DELTA_GAP.interpretation, ratio, {});
  const reading = DELTA_BAND_READING[band.id];
  if (!reading) throw new Error(`Faixa "${band.id}" do delta gap sem leitura no roteiro.`);
  return {
    deltaGap: Math.round((anionGapValue - 12 - (24 - bicarbonate)) * 10) / 10,
    ratio,
    reading,
  };
}
