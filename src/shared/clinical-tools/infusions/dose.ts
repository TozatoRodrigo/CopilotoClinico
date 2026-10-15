import { formatCompact, formatDecimal } from '../numbers';
import type { NumericRange } from '../ranges';
import { DOSE_STATUS_TONE, type DoseStatus, type ResultTone } from '../tone';
import type { DrugBolus, DrugMode, InfusionDrug } from './drugs';

/**
 * Conta da infusão contínua (CC-311): dose ↔ mL/h nos dois sentidos, faixa do
 * modo, cor da dose e bolus por peso. Porte do `calculations.ts` e do
 * `DoseCalculator.tsx` do ANY; o teste diferencial confere as duas direções.
 */

/** mL/h a partir da dose: `factor` 60 para dose por minuto, 1 para dose por hora. */
export function doseToMlh(
  dose: number,
  weightKg: number,
  concentration: number,
  factor: number,
  usesWeight: boolean,
): number {
  if (usesWeight) return (dose * weightKg * factor) / concentration;
  return (dose * factor) / concentration;
}

/** Dose a partir do mL/h (inverso exato de `doseToMlh`). */
export function mlhToDose(
  mlh: number,
  weightKg: number,
  concentration: number,
  factor: number,
  usesWeight: boolean,
): number {
  if (usesWeight) return (mlh * concentration) / (weightKg * factor);
  return (mlh * concentration) / factor;
}

/**
 * Faixa, limiares e bolus em vigor para o modo escolhido. Sem modo (ou com id
 * desconhecido), vale o primeiro modo da droga; droga sem modos usa a própria
 * faixa — a mesma regra do ANY.
 */
export interface DoseSettings {
  mode: DrugMode | null;
  min: number;
  max: number;
  step: number;
  defaultDose: number;
  /** Acima: atenção. Sem limiar, o teto da faixa assume o papel (como no ANY). */
  caution: number;
  /** Acima: dose crítica. Sem limiar, o teto da faixa. */
  critical: number;
  /** Faixa por extenso para a tela ("0,01 - 3 mcg/kg/min"). */
  rangeLabel: string;
  bolus: DrugBolus | null;
}

export function doseSettings(drug: InfusionDrug, modeId?: string | null): DoseSettings {
  const mode = drug.modes?.find(({ id }) => id === modeId) ?? drug.modes?.[0] ?? null;
  const min = mode?.doseMin ?? drug.doseMin;
  const max = mode?.doseMax ?? drug.doseMax;
  return {
    mode,
    min,
    max,
    step: mode?.doseStep ?? drug.doseStep,
    defaultDose: mode?.doseDefault ?? drug.doseDefault,
    caution: mode?.cautionThreshold ?? drug.cautionThreshold ?? max,
    critical: mode?.criticalThreshold ?? drug.criticalThreshold ?? max,
    // O ANY montava a faixa sem modo com fmt(min, 2) e fmt(max, 1), e o
    // arredondamento mostrava a vasopressina como "0,01 - 0,0" e a milrinona
    // como "0,38 - 0,8". Aqui sai o número exato (achado na revisão clínica).
    rangeLabel:
      mode?.rangeLabel ?? `${formatCompact(min, 3)} - ${formatCompact(max, 3)} ${drug.doseUnit}`,
    bolus: mode?.bolus ?? null,
  };
}

/**
 * Cor da dose (`getDoseStatus` do ANY): abaixo do mínimo é crítica, acima do
 * limiar crítico é crítica, acima do de atenção é atenção.
 */
export function doseStatus(dose: number, settings: DoseSettings): DoseStatus {
  if (dose < settings.min) return 'critical';
  if (dose > settings.critical) return 'critical';
  if (dose > settings.caution) return 'caution';
  return 'therapeutic';
}

export interface DoseStatusDetail {
  status: DoseStatus;
  tone: ResultTone;
  /** Rótulo que acompanha a cor (estado nunca só por cor). */
  label: string;
}

/**
 * Status com rótulo. O ANY só pintava; o rótulo separa "abaixo da faixa" de
 * "dose crítica", que no ANY tinham o mesmo vermelho.
 */
export function describeDoseStatus(dose: number, settings: DoseSettings): DoseStatusDetail {
  const status = doseStatus(dose, settings);
  const label =
    status === 'therapeutic'
      ? 'Na faixa'
      : status === 'caution'
        ? 'Acima do usual'
        : dose < settings.min
          ? 'Abaixo da faixa'
          : 'Dose crítica';
  return { status, tone: DOSE_STATUS_TONE[status], label };
}

/** Botões − e + do ANY: um passo, preso à faixa do modo. */
export function stepDose(dose: number, settings: DoseSettings, direction: 1 | -1): number {
  const next = Number((dose + direction * settings.step).toFixed(4));
  return direction > 0 ? Math.min(settings.max, next) : Math.max(settings.min, next);
}

/** Posição do controle deslizante: a dose presa à faixa (a dose em si pode sair dela). */
export function sliderValue(dose: number, settings: DoseSettings): number {
  return Math.min(settings.max, Math.max(settings.min, dose));
}

function decimalsOf(step: number): number {
  return (String(step).split('.')[1] ?? '').length;
}

/**
 * Casas da dose na tela: duas, ou as do passo quando ele tem mais (milrinona
 * 0,375; vasopressina 0,005). O ANY mostrava sempre duas e 0,375 aparecia como
 * "0,38".
 */
export function doseDecimals(settings: DoseSettings): number {
  return Math.max(2, decimalsOf(settings.step));
}

export function formatDose(dose: number, settings: DoseSettings): string {
  return formatDecimal(dose, doseDecimals(settings));
}

/** mL/h com uma casa, como no ANY e nas bombas. */
export function formatRate(mlh: number): string {
  return formatDecimal(mlh, 1);
}

/** Concentração sem zero inútil ("64", "0,4", "1,25"): o `fmtConc` do ANY. */
export function formatConcentration(concentration: number): string {
  return formatCompact(concentration, 2);
}

/**
 * Teto aceito no campo de dose: 3× o maior entre o teto da faixa e o limiar
 * crítico. O ANY aceitava qualquer valor ≥ 0; aqui um valor absurdo (zero a
 * mais) não vira conta (ADR-017). Acima da faixa e abaixo do teto a conta sai,
 * em vermelho, como no ANY. Faixa a confirmar na revisão clínica.
 */
export const DOSE_INPUT_CEILING_FACTOR = 3;

export function doseInputRange(drug: InfusionDrug, settings: DoseSettings): NumericRange {
  return {
    min: 0,
    max: DOSE_INPUT_CEILING_FACTOR * Math.max(settings.max, settings.critical),
    unit: drug.doseUnit,
  };
}

/** Faixa do campo de mL/h: a que corresponde à faixa da dose, para o peso e a diluição. */
export function rateInputRange(
  drug: InfusionDrug,
  settings: DoseSettings,
  weightKg: number,
  concentration: number,
): NumericRange {
  const doseMax = doseInputRange(drug, settings).max;
  const exact = doseToMlh(doseMax, weightKg, concentration, drug.factor, drug.usesWeight);
  // Uma casa, para cima: o mL/h que a tela mostra para a dose máxima também é aceito.
  return { min: 0, max: Math.ceil(exact * 10) / 10, unit: 'mL/h' };
}

export type PatientBolus =
  | { kind: 'dose'; amount: number; unit: string }
  | { kind: 'faixa'; low: number; high: number; unit: string };

/** Linha "Este paciente" da caixa de bolus, com o teto por bolus. */
export function patientBolus(bolus: DrugBolus, weightKg: number): PatientBolus | null {
  const unit = bolus.unit ?? 'mg';
  const cap = (value: number) =>
    bolus.capPerBolus !== undefined ? Math.min(value, bolus.capPerBolus) : value;
  if (bolus.perKg !== undefined) return { kind: 'dose', amount: cap(bolus.perKg * weightKg), unit };
  if (bolus.perKgRange) {
    const [low, high] = bolus.perKgRange;
    return { kind: 'faixa', low: cap(low * weightKg), high: cap(high * weightKg), unit };
  }
  return null;
}

/** "14 mg", "35 - 175 mg" (sem casa decimal, como no ANY). */
export function formatPatientBolus(bolus: PatientBolus): string {
  return bolus.kind === 'dose'
    ? `${formatDecimal(bolus.amount, 0)} ${bolus.unit}`
    : `${formatDecimal(bolus.low, 0)} - ${formatDecimal(bolus.high, 0)} ${bolus.unit}`;
}

export type InfusionEvaluation =
  | { status: 'needs-weight' }
  | {
      status: 'ready';
      dose: number;
      mlh: number;
      detail: DoseStatusDetail;
    };

/**
 * Resultado ao vivo para a tela: mL/h e cor da dose. Droga por peso sem peso
 * válido não calcula; vasopressina e morfina (sem peso) calculam sempre.
 */
export function evaluateInfusion(
  drug: InfusionDrug,
  settings: DoseSettings,
  input: { dose: number; concentration: number; weightKg: number | null },
): InfusionEvaluation {
  if (drug.usesWeight && input.weightKg === null) return { status: 'needs-weight' };
  const mlh = doseToMlh(
    input.dose,
    input.weightKg ?? 0,
    input.concentration,
    drug.factor,
    drug.usesWeight,
  );
  return {
    status: 'ready',
    dose: input.dose,
    mlh,
    detail: describeDoseStatus(input.dose, settings),
  };
}
