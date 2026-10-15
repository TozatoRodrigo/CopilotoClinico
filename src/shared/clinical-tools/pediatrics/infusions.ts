import { formatCompact, formatDecimal } from '../numbers';
import { validateNumber, type NumericFieldError, type NumericRange } from '../ranges';

/**
 * As 16 infusões contínuas pediátricas do PedGuide v4 (CC-319): diluição
 * padrão em três faixas de peso e conversão dose ↔ mL/h. Diluições e faixas
 * são as do ANY; as divergências com o §17 do CLAUDE.md do ANY e com o HETRIN
 * estão na reconciliação da fonte única (CC-321).
 */

export type PediatricInfusionUnit = 'mcg/kg/min' | 'mcg/kg/h' | 'mg/kg/h' | 'mU/kg/min';

export const WEIGHT_BANDS = ['ate-15', '15-a-40', 'acima-40'] as const;
export type WeightBand = (typeof WEIGHT_BANDS)[number];

export const WEIGHT_BAND_LABEL: Record<WeightBand, string> = {
  'ate-15': '< 15 kg',
  '15-a-40': '15–40 kg',
  'acima-40': '> 40 kg',
};

export interface Dilution {
  /** mL da ampola. */
  drugMl: number;
  diluentMl: number;
  /** Concentração final usada na conta, na unidade de massa da dose por mL. */
  concentration: number;
  finalVolumeMl: number;
}

export const INFUSION_CATEGORIES = [
  { id: 'vasoativos', label: 'Vasoativos' },
  { id: 'sedativos', label: 'Sedativos e analgesia' },
  { id: 'outros', label: 'Outros' },
] as const;

export type InfusionCategory = (typeof INFUSION_CATEGORIES)[number]['id'];

export interface PediatricInfusion {
  /** Id do ANY: é a chave da reconciliação da fonte única (CC-321). */
  id: string;
  name: string;
  category: InfusionCategory;
  unit: PediatricInfusionUnit;
  /** Faixa de dose aceita. Fora dela a dose é recusada (ADR-017). */
  range: { min: number; max: number };
  step: number;
  defaultDose: number;
  presentation: string;
  warning?: string;
  dilutions: Record<WeightBand, Dilution>;
}

function dilution(
  drugMl: number,
  diluentMl: number,
  concentration: number,
  finalVolumeMl: number,
): Dilution {
  return { drugMl, diluentMl, concentration, finalVolumeMl };
}

function bands(small: Dilution, medium: Dilution, large: Dilution): Record<WeightBand, Dilution> {
  return { 'ate-15': small, '15-a-40': medium, 'acima-40': large };
}

export const PEDIATRIC_INFUSIONS: readonly PediatricInfusion[] = [
  {
    id: 'dobutamina',
    name: 'DOBUTAMINA',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 2.5, max: 20 },
    step: 0.5,
    defaultDose: 5,
    presentation: '12,5 mg/mL',
    dilutions: bands(
      dilution(10, 60, 1785, 70),
      dilution(20, 120, 1785, 140),
      dilution(50, 200, 2500, 250),
    ),
  },
  {
    id: 'dopamina',
    name: 'DOPAMINA',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 2, max: 20 },
    step: 1,
    defaultDose: 5,
    presentation: '5 mg/mL',
    dilutions: bands(
      dilution(20, 30, 2000, 50),
      dilution(40, 60, 2000, 100),
      dilution(100, 150, 2000, 250),
    ),
  },
  {
    id: 'epinefrina_inf',
    name: 'EPINEFRINA',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 0.01, max: 1 },
    step: 0.01,
    defaultDose: 0.1,
    presentation: '1 mg/mL',
    dilutions: bands(
      dilution(1, 30, 32.3, 31),
      dilution(5, 150, 32.3, 155),
      dilution(6, 200, 29.1, 206),
    ),
  },
  {
    id: 'norepinefrina',
    name: 'NOREPINEFRINA',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 0.05, max: 2 },
    step: 0.05,
    defaultDose: 0.1,
    presentation: '1 mg/mL',
    warning: 'Diluir em SG 5%',
    dilutions: bands(
      dilution(4, 60, 62.5, 64),
      dilution(8, 120, 62.5, 128),
      dilution(16, 250, 60, 266),
    ),
  },
  {
    id: 'vasopressina',
    name: 'VASOPRESSINA',
    category: 'vasoativos',
    unit: 'mU/kg/min',
    range: { min: 0.2, max: 2 },
    step: 0.1,
    defaultDose: 0.5,
    presentation: '20 U/mL',
    // 2 ampolas + SF 98 mL = 0,4 U/mL em todas as faixas: padrão do serviço,
    // igual ao adulto (confirmado por Gustavo em 22/08/2026, segundo o ANY).
    dilutions: bands(
      dilution(2, 98, 400, 100),
      dilution(2, 98, 400, 100),
      dilution(2, 98, 400, 100),
    ),
  },
  {
    id: 'nitroprussiato',
    name: 'NITROPRUSSIATO',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 0.5, max: 10 },
    step: 0.5,
    defaultDose: 1,
    presentation: '25 mg/mL',
    warning: 'Diluir em SG 5%. Proteger da luz.',
    dilutions: bands(dilution(1, 40, 610, 41), dilution(1, 40, 610, 41), dilution(2, 80, 610, 82)),
  },
  {
    id: 'milrinona',
    name: 'MILRINONA',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 0.25, max: 0.75 },
    step: 0.05,
    defaultDose: 0.5,
    presentation: '1 mg/mL',
    dilutions: bands(
      dilution(10, 40, 200, 50),
      dilution(20, 80, 200, 100),
      dilution(30, 120, 200, 150),
    ),
  },
  {
    id: 'amiodarona_inf',
    name: 'AMIODARONA',
    category: 'vasoativos',
    unit: 'mcg/kg/min',
    range: { min: 5, max: 15 },
    step: 1,
    defaultDose: 10,
    presentation: '50 mg/mL',
    warning: 'Diluir em SG 5%',
    dilutions: bands(
      dilution(3, 47, 3000, 50),
      dilution(6, 95, 2970, 101),
      dilution(9, 140, 3020, 149),
    ),
  },
  {
    id: 'fentanil_inf',
    name: 'FENTANIL',
    category: 'sedativos',
    unit: 'mcg/kg/h',
    range: { min: 0.5, max: 4 },
    step: 0.5,
    defaultDose: 1,
    presentation: '50 mcg/mL',
    dilutions: bands(
      dilution(10, 40, 10, 50),
      dilution(20, 80, 10, 100),
      dilution(60, 90, 20, 150),
    ),
  },
  {
    id: 'midazolam_inf',
    name: 'MIDAZOLAM',
    category: 'sedativos',
    unit: 'mcg/kg/min',
    range: { min: 1, max: 18 },
    step: 1,
    defaultDose: 2,
    presentation: '5 mg/mL',
    dilutions: bands(
      dilution(10, 40, 1000, 50),
      dilution(20, 80, 1000, 100),
      dilution(60, 90, 2000, 150),
    ),
  },
  {
    id: 'cetamina_inf',
    name: 'CETAMINA',
    category: 'sedativos',
    unit: 'mcg/kg/min',
    range: { min: 5, max: 40 },
    step: 5,
    defaultDose: 10,
    presentation: '50 mg/mL',
    dilutions: bands(
      dilution(6, 54, 5000, 60),
      dilution(6, 54, 5000, 60),
      dilution(20, 180, 5000, 200),
    ),
  },
  {
    id: 'dexmedetomidina',
    name: 'DEXMEDETOMIDINA',
    category: 'sedativos',
    unit: 'mcg/kg/h',
    range: { min: 0.2, max: 1.4 },
    step: 0.1,
    defaultDose: 0.5,
    presentation: '100 mcg/mL',
    dilutions: bands(dilution(2, 48, 4, 50), dilution(4, 96, 4, 100), dilution(8, 192, 4, 200)),
  },
  {
    id: 'morfina',
    name: 'MORFINA',
    category: 'sedativos',
    unit: 'mcg/kg/h',
    range: { min: 10, max: 40 },
    step: 5,
    defaultDose: 20,
    presentation: '10 mg/mL',
    dilutions: bands(
      dilution(1, 49, 200, 50),
      dilution(2, 98, 200, 100),
      dilution(4, 96, 400, 100),
    ),
  },
  {
    id: 'propofol_inf',
    name: 'PROPOFOL 1%',
    category: 'sedativos',
    unit: 'mg/kg/h',
    range: { min: 1, max: 4 },
    step: 0.5,
    defaultDose: 2,
    presentation: '10 mg/mL',
    warning: 'Não usar em crianças para sedação prolongada',
    dilutions: bands(dilution(20, 0, 10, 20), dilution(50, 0, 10, 50), dilution(50, 0, 10, 50)),
  },
  {
    id: 'rocuronio_inf',
    name: 'ROCURONIO',
    category: 'outros',
    unit: 'mcg/kg/min',
    range: { min: 5, max: 15 },
    step: 1,
    defaultDose: 10,
    presentation: '10 mg/mL',
    dilutions: bands(
      dilution(10, 40, 2000, 50),
      dilution(20, 80, 2000, 100),
      dilution(50, 200, 2000, 250),
    ),
  },
  {
    id: 'cisatracurio_inf',
    name: 'CISATRACURIO',
    category: 'outros',
    unit: 'mcg/kg/min',
    range: { min: 1, max: 4 },
    step: 0.5,
    defaultDose: 2,
    presentation: '2 mg/mL',
    dilutions: bands(
      dilution(10, 40, 400, 50),
      dilution(15, 60, 400, 75),
      dilution(50, 200, 400, 250),
    ),
  },
];

const BY_ID = new Map(PEDIATRIC_INFUSIONS.map((infusion) => [infusion.id, infusion]));

export function getPediatricInfusion(id: string): PediatricInfusion | undefined {
  return BY_ID.get(id);
}

/** Faixa de diluição pelo peso: abaixo de 15 kg, de 15 a 40 kg (inclusive) e acima de 40. */
export function weightBand(kg: number): WeightBand {
  if (kg < 15) return 'ate-15';
  if (kg <= 40) return '15-a-40';
  return 'acima-40';
}

export function dilutionFor(infusion: PediatricInfusion, kg: number): Dilution {
  return infusion.dilutions[weightBand(kg)];
}

/** Dose por minuto vira mL/h multiplicando por 60; dose por hora, não. */
function perHourFactor(unit: PediatricInfusionUnit): number {
  return unit === 'mcg/kg/min' || unit === 'mU/kg/min' ? 60 : 1;
}

/** mL/h para a dose e o peso, na diluição da faixa do peso. */
export function infusionRate(infusion: PediatricInfusion, dose: number, kg: number): number {
  const { concentration } = dilutionFor(infusion, kg);
  const factor = perHourFactor(infusion.unit);
  // Mesma ordem do ANY: (dose × peso × 60) ÷ concentração.
  return factor === 60 ? (dose * kg * 60) / concentration : (dose * kg) / concentration;
}

/** Dose para a vazão em mL/h e o peso (a conta inversa). */
export function doseFromRate(infusion: PediatricInfusion, mlPerHour: number, kg: number): number {
  const { concentration } = dilutionFor(infusion, kg);
  const factor = perHourFactor(infusion.unit);
  return factor === 60 ? (mlPerHour * concentration) / (kg * 60) : (mlPerHour * concentration) / kg;
}

/** Vazão com uma casa, ou duas abaixo de 0,1 mL/h (como o ANY mostra). */
export function formatRate(mlPerHour: number): string {
  return formatDecimal(mlPerHour, mlPerHour < 0.1 ? 2 : 1);
}

/** Casas da dose pelo passo do controle: 0,01 → 2; 0,5 → 1; 1 → 0. */
export function doseDecimals(infusion: PediatricInfusion): number {
  if (infusion.step < 0.1) return 2;
  if (infusion.step < 1) return 1;
  return 0;
}

/**
 * Concentração como o ANY mostra: mcg/mL acima de 1000 vira mg/mL com uma
 * casa ("1,8 mg/mL"), mU/mL acima de 1000 vira U/mL.
 */
export function formatConcentration(concentration: number, unit: PediatricInfusionUnit): string {
  if (unit === 'mU/kg/min') {
    return concentration >= 1000
      ? `${formatDecimal(concentration / 1000, 1)} U/mL`
      : `${formatCompact(concentration)} mU/mL`;
  }
  if (unit === 'mcg/kg/min' || unit === 'mcg/kg/h') {
    return concentration >= 1000
      ? `${formatDecimal(concentration / 1000, 1)} mg/mL`
      : `${formatCompact(concentration)} mcg/mL`;
  }
  return `${formatCompact(concentration)} mg/mL`;
}

export function doseRange(infusion: PediatricInfusion): NumericRange {
  return { min: infusion.range.min, max: infusion.range.max, unit: infusion.unit };
}

/** Vazão digitada na conta inversa: acima de zero e até 999 mL/h. */
export const RATE_RANGE: NumericRange = { min: 0.01, max: 999, unit: 'mL/h' };

export type InfusionEvaluation =
  | { status: 'vazio' }
  | { status: 'invalido'; error: NumericFieldError }
  | { status: 'pronto'; dose: number; rate: number; band: WeightBand; dilution: Dilution };

/** Dose digitada → mL/h. Dose fora da faixa da droga é erro e não vira vazão. */
export function evaluateInfusionDose(
  infusion: PediatricInfusion,
  kg: number,
  doseText: string,
): InfusionEvaluation {
  if (doseText.trim() === '') return { status: 'vazio' };
  const checked = validateNumber(doseText, doseRange(infusion));
  if (!checked.ok) return { status: 'invalido', error: checked.error };
  const band = weightBand(kg);
  return {
    status: 'pronto',
    dose: checked.value,
    rate: infusionRate(infusion, checked.value, kg),
    band,
    dilution: infusion.dilutions[band],
  };
}

export type RateEvaluation =
  | { status: 'vazio' }
  | { status: 'invalido'; error: NumericFieldError }
  | {
      status: 'pronto';
      rate: number;
      dose: number;
      /** A vazão corresponde a uma dose fora da faixa usual da droga. */
      outsideRange: boolean;
    };

/** mL/h digitado → dose (a bomba já está correndo). */
export function evaluateInfusionRate(
  infusion: PediatricInfusion,
  kg: number,
  rateText: string,
): RateEvaluation {
  if (rateText.trim() === '') return { status: 'vazio' };
  const checked = validateNumber(rateText, RATE_RANGE);
  if (!checked.ok) return { status: 'invalido', error: checked.error };
  const dose = doseFromRate(infusion, checked.value, kg);
  return {
    status: 'pronto',
    rate: checked.value,
    dose,
    outsideRange: dose < infusion.range.min || dose > infusion.range.max,
  };
}
