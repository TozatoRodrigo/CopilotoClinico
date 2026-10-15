import { formatDecimal } from '../numbers';
import { validateNumber, type NumericFieldResult, type NumericRange } from '../ranges';

/**
 * Lactato nas duas unidades usadas no Brasil (CC-316). O roteiro raciocina em
 * mmol/L, como o ANY; a tela aceita e mostra as duas.
 */

export const LACTATE_UNITS = ['mmol/L', 'mg/dL'] as const;
export type LactateUnit = (typeof LACTATE_UNITS)[number];

/** Unidade inicial: a do ANY ("mg/dL, predominante no Brasil"). */
export const DEFAULT_LACTATE_UNIT: LactateUnit = 'mg/dL';

/**
 * Fator do `lactatoConvert` do ANY: 1 mmol/L = 9 mg/dL. O `units.ts` do mesmo
 * ANY usa 9,01; a diferença está na revisão clínica.
 */
export const LACTATE_MG_DL_PER_MMOL_L = 9;

/**
 * Faixas aceitas. No ANY o campo ia de 0 a 30 nas duas unidades (o máximo não
 * barrava nada); aqui o teto de 30 mmol/L vale também em mg/dL (270).
 */
export const LACTATE_RANGES: Record<LactateUnit, NumericRange> = {
  'mmol/L': { min: 0.1, max: 30, unit: 'mmol/L' },
  'mg/dL': { min: 1, max: 270, unit: 'mg/dL' },
};

/** Valor digitado na unidade escolhida → mmol/L (mg/dL ÷ 9, como no ANY). */
export function lactateToMmol(value: number, unit: LactateUnit): number {
  return unit === 'mmol/L' ? value : value / LACTATE_MG_DL_PER_MMOL_L;
}

/** mmol/L → mg/dL (× 9). */
export function lactateMmolToMgDl(mmol: number): number {
  return mmol * LACTATE_MG_DL_PER_MMOL_L;
}

/** Lê o lactato digitado e devolve em mmol/L; fora da faixa da unidade não vale. */
export function readLactate(raw: string, unit: LactateUnit): NumericFieldResult {
  const checked = validateNumber(raw, LACTATE_RANGES[unit]);
  return checked.ok ? { ok: true, value: lactateToMmol(checked.value, unit) } : checked;
}

/**
 * As duas unidades lado a lado, a digitada primeiro: "36,0 mg/dL = 4,0 mmol/L".
 * Mesma conta do ANY (o mg/dL mostrado é o mmol/L × 9, não o valor digitado),
 * para a tela mostrar o mesmo número que lá.
 */
export function describeLactate(mmol: number, unit: LactateUnit): string {
  const mgdl = lactateMmolToMgDl(mmol);
  return unit === 'mmol/L'
    ? `${formatDecimal(mmol, 1)} mmol/L = ${formatDecimal(mgdl, 1)} mg/dL`
    : `${formatDecimal(mgdl, 1)} mg/dL = ${formatDecimal(mmol, 1)} mmol/L`;
}
