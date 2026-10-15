import {
  validateNumber,
  validateWeight,
  type NumericFieldResult,
  type NumericRange,
} from '../ranges';
import { DIFFICULT_AIRWAY_MIN_PREDICTORS, LIMITED_VIEW_GRADES, type AirwayNotice } from './content';
import { suggestedTube, supraglotticDeviceText } from './devices';
import {
  AIRWAY_DRUGS,
  airwayDose,
  receivesDoseReduction,
  reducedDoseRange,
  type AirwayDose,
  type AirwayDrug,
  type ReducedDoseRange,
} from './drugs';
import { shockIndexOf, type AirwayState } from './state';
import {
  AIRWAY_RANGES,
  formatShockIndex,
  heartRateAlert,
  SHOCK_INDEX_MARKS_H_ABOVE,
  systolicAlert,
  type AirwayShockIndex,
  type VitalAlert,
} from './vitals';

/**
 * O que a tela do roteiro mostra a partir do estado e do peso: contagens,
 * índice de choque, instabilidade, doses, tamanhos e avisos. Puro: a mesma
 * entrada dá sempre a mesma tela, e o teste diferencial compara com o ANY.
 */

export interface AirwayDrugView {
  drug: AirwayDrug;
  ratePerKg: number;
  selected: boolean;
  /** `null` sem peso válido: o ANY caía para 70 kg; aqui não há dose sem peso. */
  dose: AirwayDose | null;
  /** Faixa com a redução de 30–50%, quando ela se aplica (indutor, instável ou idoso). */
  reduced: ReducedDoseRange | null;
}

export interface AirwayView {
  weight: NumericFieldResult;
  weightKg: number | null;
  /** Campo opcional: vazio não é erro. */
  heightCm: number | null;
  shockIndex: AirwayShockIndex | null;
  heartRateAlert: VitalAlert | null;
  systolicAlert: VitalAlert | null;
  /** Aviso de H marcado pelo índice de choque (o toast do ANY que nunca aparecia). */
  hAutoNotice: AirwayNotice | null;
  hasIndication: boolean;
  crashCount: number;
  lemonCount: number;
  romanCount: number;
  difficultAnatomy: boolean;
  hemodynamicInstability: boolean;
  doseReduction: boolean;
  patientDataComplete: boolean;
  tube: string | null;
  supraglotticDevice: string;
  limitedView: boolean;
  drugs: readonly AirwayDrugView[];
}

/** Valor de um campo opcional: vazio ou inválido não entra na conta. */
export function optionalValue(raw: string, range: NumericRange): number | null {
  const checked = validateNumber(raw, range);
  return checked.ok ? checked.value : null;
}

function valueOf(raw: string, range: NumericRange): number | null {
  return raw.trim() === '' ? null : optionalValue(raw, range);
}

/**
 * Aviso de H marcado pelo índice de choque. Se o médico corrigir FC ou PAS
 * depois, o H continua marcado (regra do ANY) e o aviso mostra o índice atual.
 */
function hAutoNotice(state: AirwayState, shockIndex: AirwayShockIndex | null): AirwayNotice | null {
  if (!state.hFromShockIndex || !state.crash.includes('H')) return null;
  let line = 'O índice de choque passou de 1,0 quando foi digitado.';
  if (shockIndex?.marksH) line = `Índice de choque ${formatShockIndex(shockIndex)}, acima de 1,0.`;
  else if (shockIndex) {
    line = `O índice de choque passou de 1,0 quando foi digitado; o atual é ${formatShockIndex(shockIndex)}.`;
  }
  return { tone: 'attention', title: 'H (hipotensão) marcado automaticamente', lines: [line] };
}

export function deriveAirway(state: AirwayState, weightRaw: string): AirwayView {
  const weight = validateWeight(weightRaw, 'adulto');
  const weightKg = weight.ok ? weight.value : null;
  const heightCm = valueOf(state.height, AIRWAY_RANGES.height);
  const heartRate = valueOf(state.heartRate, AIRWAY_RANGES.heartRate);
  const systolic = valueOf(state.systolic, AIRWAY_RANGES.systolic);
  const shockIndex = shockIndexOf(state);

  const lemonCount = state.lemon.length;
  const romanCount = state.roman.length;
  // O ANY compara o índice já arredondado (2 casas) para a instabilidade.
  const hemodynamicInstability =
    state.crash.includes('H') ||
    (shockIndex !== null && shockIndex.value > SHOCK_INDEX_MARKS_H_ABOVE);
  const doseReduction = hemodynamicInstability || state.population === 'idoso';

  return {
    weight,
    weightKg,
    heightCm,
    shockIndex,
    heartRateAlert: heartRate === null ? null : heartRateAlert(heartRate),
    systolicAlert: systolic === null ? null : systolicAlert(systolic),
    hAutoNotice: hAutoNotice(state, shockIndex),
    hasIndication: state.indications.length > 0,
    crashCount: state.crash.length,
    lemonCount,
    romanCount,
    difficultAnatomy:
      lemonCount >= DIFFICULT_AIRWAY_MIN_PREDICTORS ||
      romanCount >= DIFFICULT_AIRWAY_MIN_PREDICTORS,
    hemodynamicInstability,
    doseReduction,
    patientDataComplete: weightKg !== null && state.sex !== null,
    tube: state.sex ? suggestedTube(state.sex) : null,
    supraglotticDevice: supraglotticDeviceText(weightKg, heightCm),
    limitedView: state.cormack !== null && LIMITED_VIEW_GRADES.includes(state.cormack),
    drugs: AIRWAY_DRUGS.map((drug) => {
      const ratePerKg = state.rates[drug.id];
      return {
        drug,
        ratePerKg,
        selected: state.drugs.includes(drug.id),
        dose: weightKg === null ? null : airwayDose(drug, weightKg, ratePerKg),
        reduced:
          weightKg !== null && doseReduction && receivesDoseReduction(drug)
            ? reducedDoseRange(drug, weightKg, ratePerKg)
            : null,
      };
    }),
  };
}
