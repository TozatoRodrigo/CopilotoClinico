import { formatCompact } from '../numbers';

/**
 * Medicações da intubação em sequência rápida do AirwayGuide do ANY App v4
 * (`DRUGS`): apresentação, concentração, régua de dose por kg e valor inicial,
 * iguais ao ANY. O teste diferencial (tests/clinical-tools) confere campo a
 * campo e a conta em 1.000 entradas.
 */

export const AIRWAY_DRUG_IDS = [
  'fentanil',
  'cetamina',
  'etomidato',
  'propofol',
  'rocuronio',
  'succinilcolina',
] as const;

export type AirwayDrugId = (typeof AIRWAY_DRUG_IDS)[number];

export const AIRWAY_DRUG_CATEGORIES = [
  { id: 'simpatolitico', label: 'Bloqueio simpático — simpatólise (opcional)', pick: 'opcional' },
  { id: 'indutor', label: 'Indutores (selecione 1)', pick: 'um' },
  { id: 'bnm', label: 'BNM (selecione 1)', pick: 'um' },
] as const;

export type AirwayDrugCategory = (typeof AIRWAY_DRUG_CATEGORIES)[number]['id'];

export interface DoseRule {
  min: number;
  max: number;
  step: number;
  /** Valor inicial da régua. */
  initial: number;
}

export interface AirwayDrug {
  id: AirwayDrugId;
  name: string;
  presentation: string;
  /** Concentração da apresentação, na unidade da dose por mL. */
  concentration: number;
  doseUnit: 'mcg' | 'mg';
  rateUnit: 'mcg/kg' | 'mg/kg';
  rate: DoseRule;
  /**
   * Casas da dose: o ANY arredonda a dose para inteiro, e a do etomidato
   * para 0,1 mg (`calcDose` × `calcDoseDecimal`).
   */
  doseDecimals: 0 | 1;
  category: AirwayDrugCategory;
  /** Aviso mostrado quando a droga está selecionada. */
  alert?: string;
}

export const AIRWAY_DRUGS: readonly AirwayDrug[] = [
  {
    id: 'fentanil',
    name: 'Fentanil',
    presentation: '50 mcg/mL — ampola 2–10 mL | IV lento, 3 min antes',
    concentration: 50,
    doseUnit: 'mcg',
    rateUnit: 'mcg/kg',
    rate: { min: 1, max: 3, step: 0.5, initial: 3 },
    doseDecimals: 0,
    category: 'simpatolitico',
  },
  {
    id: 'cetamina',
    name: 'Cetamina',
    presentation: '50 mg/mL — ampola 10 mL',
    concentration: 50,
    doseUnit: 'mg',
    rateUnit: 'mg/kg',
    rate: { min: 1, max: 2, step: 0.5, initial: 1.5 },
    doseDecimals: 0,
    category: 'indutor',
    alert: 'Uso com cautela em emergência hipertensiva. Considere etomidato como alternativa.',
  },
  {
    id: 'etomidato',
    name: 'Etomidato',
    presentation: '2 mg/mL (10 mL)',
    concentration: 2,
    doseUnit: 'mg',
    rateUnit: 'mg/kg',
    rate: { min: 0.2, max: 0.4, step: 0.01, initial: 0.3 },
    doseDecimals: 1,
    category: 'indutor',
  },
  {
    id: 'propofol',
    name: 'Propofol',
    presentation: '10 mg/mL (20 mL)',
    concentration: 10,
    doseUnit: 'mg',
    rateUnit: 'mg/kg',
    rate: { min: 1, max: 2.5, step: 0.5, initial: 1.5 },
    doseDecimals: 0,
    category: 'indutor',
  },
  {
    id: 'rocuronio',
    name: 'Rocurônio',
    presentation: '10 mg/mL (5 mL)',
    concentration: 10,
    doseUnit: 'mg',
    rateUnit: 'mg/kg',
    rate: { min: 1.5, max: 2, step: 0.1, initial: 1.5 },
    doseDecimals: 0,
    category: 'bnm',
  },
  {
    id: 'succinilcolina',
    name: 'Succinilcolina',
    presentation: '10 mg/mL (10 mL)',
    concentration: 10,
    doseUnit: 'mg',
    rateUnit: 'mg/kg',
    rate: { min: 1.5, max: 2, step: 0.1, initial: 1.5 },
    doseDecimals: 0,
    category: 'bnm',
    alert:
      'Contraindicada em hipercalemia, queimaduras extensas (> 72 h), miopatias, lesão medular crônica e doença do neurônio motor.',
  },
];

const BY_ID = new Map(AIRWAY_DRUGS.map((drug) => [drug.id, drug]));

export function getAirwayDrug(id: AirwayDrugId): AirwayDrug {
  const drug = BY_ID.get(id);
  if (!drug) throw new Error(`Droga "${id}" ausente em AIRWAY_DRUGS.`);
  return drug;
}

export function isAirwayDrugId(value: unknown): value is AirwayDrugId {
  return typeof value === 'string' && (AIRWAY_DRUG_IDS as readonly string[]).includes(value);
}

/** Indutor e BNM são escolha única dentro da categoria; o fentanil é opcional (`TOGGLE_MED` do ANY). */
export function isExclusiveCategory(category: AirwayDrugCategory): boolean {
  return category !== 'simpatolitico';
}

/**
 * Redução sugerida da dose do indutor em paciente instável ou idoso (aviso do
 * passo 8 do ANY: "considere reduzir a dose do indutor em 30–50%"). Vale só
 * para os indutores, como no texto do ANY.
 */
export const INDUCTION_DOSE_REDUCTION = { minPercent: 30, maxPercent: 50 } as const;

export function receivesDoseReduction(drug: AirwayDrug): boolean {
  return drug.category === 'indutor';
}

function roundDose(drug: AirwayDrug, raw: number): number {
  return drug.doseDecimals === 1 ? Math.round(raw * 10) / 10 : Math.round(raw);
}

/** Casas do passo da régua: 0,01 → 2; 0,5 → 1; 1 → 0. */
function stepDecimals(step: number): number {
  return (String(step).split('.')[1] ?? '').length;
}

/**
 * Leva um valor para a régua da droga: dentro do mínimo e do máximo e no
 * passo, como o `<input type="range">` do ANY. Valor salvo de outra versão ou
 * fora da faixa nunca vira dose.
 */
export function snapRate(drug: AirwayDrug, value: number): number {
  const { min, max, step } = drug.rate;
  if (!Number.isFinite(value)) return drug.rate.initial;
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return Number((min + steps * step).toFixed(stepDecimals(step)));
}

export interface AirwayDose {
  /** Dose total, arredondada como no ANY. */
  dose: number;
  /** Volume da apresentação, em mL (a tela mostra com 1 casa, como o ANY). */
  volumeMl: number;
}

/** Dose = peso × dose por kg, arredondada como no ANY; volume = dose ÷ concentração. */
export function airwayDose(drug: AirwayDrug, weightKg: number, ratePerKg: number): AirwayDose {
  const dose = roundDose(drug, weightKg * ratePerKg);
  return { dose, volumeMl: dose / drug.concentration };
}

export interface ReducedDoseRange {
  /** Dose com a redução maior (50%). */
  from: AirwayDose;
  /** Dose com a redução menor (30%). */
  to: AirwayDose;
}

/**
 * Faixa da dose com a redução de 30–50% sobre a dose da régua. A conta parte
 * de peso × dose por kg (antes de arredondar) e arredonda como a dose cheia;
 * o percentual entra em inteiros para 0,7 não virar 0,69999….
 */
export function reducedDoseRange(
  drug: AirwayDrug,
  weightKg: number,
  ratePerKg: number,
): ReducedDoseRange {
  const raw = weightKg * ratePerKg;
  const at = (keptPercent: number): AirwayDose => {
    const dose = roundDose(drug, (raw * keptPercent) / 100);
    return { dose, volumeMl: dose / drug.concentration };
  };
  return {
    from: at(100 - INDUCTION_DOSE_REDUCTION.maxPercent),
    to: at(100 - INDUCTION_DOSE_REDUCTION.minPercent),
  };
}

/** "0,3 mg/kg", "1,5 mg/kg", "3 mcg/kg". */
export function formatRate(drug: AirwayDrug, ratePerKg: number): string {
  return `${formatCompact(ratePerKg, 2)} ${drug.rateUnit}`;
}

/** "21,8 mg", "105 mg", "210 mcg". */
export function formatDose(drug: AirwayDrug, dose: number): string {
  return `${formatCompact(dose, drug.doseDecimals)} ${drug.doseUnit}`;
}
