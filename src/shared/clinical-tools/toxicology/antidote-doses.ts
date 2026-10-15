import { formatCompact, formatDecimal } from '../numbers';
import type { NumericRange } from '../ranges';
import { toxChartSourceLine } from './provenance';

/**
 * Contas dos cards de antídoto do ToxPath (CC-323): as três etapas da NAC
 * por peso e a manutenção da atropina. O nomograma de Rumack-Matthew do card
 * da NAC não mora aqui: é a calculadora `nomograma-rumack`, com a conta de
 * `rumack-matthew.ts` (uma implementação só).
 */

// ---- N-acetilcisteína (protocolo IV de 21 h, Prescott) ----------------------------------

/** Peso aceito pelo ANY na calculadora da NAC (fora dela o ANY não mostrava doses). */
export const NAC_WEIGHT_RANGE: NumericRange = { min: 20, max: 250, unit: 'kg' };

export interface NacStageDefinition {
  stage: 1 | 2 | 3;
  mgPerKg: number;
  /** Volume de SF da etapa. */
  diluentMl: number;
  hours: number;
}

export const NAC_PRESCOTT_STAGES: readonly NacStageDefinition[] = [
  { stage: 1, mgPerKg: 150, diluentMl: 200, hours: 1 },
  { stage: 2, mgPerKg: 50, diluentMl: 500, hours: 4 },
  { stage: 3, mgPerKg: 100, diluentMl: 1000, hours: 16 },
];

/** Dose total do protocolo (soma das etapas), como o ANY mostrava. */
export const NAC_TOTAL_MG_PER_KG = 300;
export const NAC_TOTAL_HOURS = 21;

export interface NacStageDose extends NacStageDefinition {
  doseMg: number;
}

export interface NacDoses {
  weightKg: number;
  stages: readonly NacStageDose[];
  totalMg: number;
}

export function nacDoses(weightKg: number): NacDoses {
  return {
    weightKg,
    stages: NAC_PRESCOTT_STAGES.map((stage) => ({ ...stage, doseMg: stage.mgPerKg * weightKg })),
    totalMg: NAC_TOTAL_MG_PER_KG * weightKg,
  };
}

/** "10,5 g (10500 mg)": gramas com uma casa, como no ANY, e os mg sem resto de ponto flutuante. */
export function formatNacDose(doseMg: number): string {
  return `${formatDecimal(doseMg / 1000, 1)} g (${formatCompact(doseMg, 1)} mg)`;
}

/** "1ª etapa (1 hora)" / "2ª etapa (4 horas)". */
export function nacStageTitle(stage: NacStageDefinition): string {
  return `${stage.stage}ª etapa (${stage.hours} ${stage.hours === 1 ? 'hora' : 'horas'})`;
}

/** "10,5 g (10500 mg) em 200 mL SF". */
export function nacStageText(stage: NacStageDose): string {
  return `${formatNacDose(stage.doseMg)} em ${stage.diluentMl} mL SF`;
}

/** "Dose total: 21,0 g em 21 horas". */
export function nacTotalText(doses: NacDoses): string {
  return `Dose total: ${formatDecimal(doses.totalMg / 1000, 1)} g em ${NAC_TOTAL_HOURS} horas`;
}

export function buildNacChartNote(doses: NacDoses): string {
  return [
    `N-acetilcisteína IV (Prescott, ${NAC_TOTAL_HOURS} h) para ${formatCompact(doses.weightKg, 1)} kg:`,
    ...doses.stages.map((stage) => `- ${nacStageTitle(stage)}: ${nacStageText(stage)}`),
    `${nacTotalText(doses)}.`,
    toxChartSourceLine(),
  ].join('\n');
}

// ---- Atropina (manutenção após o ataque) ------------------------------------------------

export const ATROPINE = {
  /** Apresentação do ANY: 0,25 mg/mL, ampola de 1 mL. */
  ampouleMg: 0.25,
  /** Infusão contínua: 20% da dose de ataque por hora. */
  maintenanceFraction: 0.2,
} as const;

/**
 * Dose de ataque efetiva aceita. O ANY aceitava qualquer valor > 0; a faixa
 * vai de 0,01 mg (lactente) a 1.000 mg ("centenas de mg" no próprio card).
 */
export const ATROPINE_LOADING_RANGE: NumericRange = { min: 0.01, max: 1000, unit: 'mg' };

export interface AtropineMaintenance {
  loadingMg: number;
  mgPerHour: number;
  /** Ampolas por hora, arredondadas para cima (o ANY usa `Math.ceil`). */
  ampoulesPerHour: number;
}

export function atropineMaintenance(loadingMg: number): AtropineMaintenance {
  const mgPerHour = loadingMg * ATROPINE.maintenanceFraction;
  return { loadingMg, mgPerHour, ampoulesPerHour: Math.ceil(mgPerHour / ATROPINE.ampouleMg) };
}

/** "1,60 mg/hora", com duas casas como no ANY. */
export function atropineRateText(result: AtropineMaintenance): string {
  return `${formatDecimal(result.mgPerHour, 2)} mg/hora`;
}

/** "Aprox. 7 ampolas/hora (0,25 mg/amp)". */
export function atropineAmpoulesText(result: AtropineMaintenance): string {
  return `Aprox. ${result.ampoulesPerHour} ampolas/hora (${formatCompact(ATROPINE.ampouleMg)} mg/amp)`;
}

export function buildAtropineChartNote(result: AtropineMaintenance): string {
  return [
    `Atropina — manutenção (${formatCompact(ATROPINE.maintenanceFraction * 100)}% da dose de ataque/hora): ${atropineRateText(result)}, ${atropineAmpoulesText(result)}.`,
    `Dose de ataque efetiva: ${formatCompact(result.loadingMg)} mg.`,
    toxChartSourceLine(),
  ].join('\n');
}
