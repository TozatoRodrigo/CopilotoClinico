import { formatCompact, formatQuantity } from '../numbers';
import { validateWeight, type NumericFieldError } from '../ranges';
import { MAX_DOSE_NOTICE } from './content';

/**
 * Dose máxima de anestésico local por peso e emulsão lipídica do LAST, como
 * no BlockPath do ANY. As contas seguem a mesma ordem das do ANY (peso × mg/kg
 * ÷ mg/mL), para o número sair idêntico até a última casa: o teste diferencial
 * compara com tolerância zero.
 */

export const LOCAL_ANESTHETIC_IDS = ['lidocaina', 'bupivacaina', 'ropivacaina'] as const;
export type LocalAnestheticId = (typeof LOCAL_ANESTHETIC_IDS)[number];

/** Com ou sem vasoconstritor (epinefrina) na solução. */
export const EPINEPHRINE_OPTIONS = ['sem', 'com'] as const;
export type Epinephrine = (typeof EPINEPHRINE_OPTIONS)[number];

export const EPINEPHRINE_LABEL: Record<Epinephrine, string> = {
  sem: 'Sem epinefrina',
  com: 'Com epinefrina',
};

export interface AnestheticConcentration {
  /** Como aparece na ampola ("0,25%"). */
  label: string;
  mgPerMl: number;
}

export interface LocalAnesthetic {
  id: LocalAnestheticId;
  name: string;
  /** Dose máxima em mg/kg, sem e com epinefrina. */
  maxMgPerKg: Record<Epinephrine, number>;
  concentrations: readonly AnestheticConcentration[];
}

export const LOCAL_ANESTHETICS: readonly LocalAnesthetic[] = [
  {
    id: 'lidocaina',
    name: 'Lidocaína',
    maxMgPerKg: { sem: 4.5, com: 7 },
    concentrations: [
      { label: '1%', mgPerMl: 10 },
      { label: '2%', mgPerMl: 20 },
    ],
  },
  {
    id: 'bupivacaina',
    name: 'Bupivacaína',
    maxMgPerKg: { sem: 2.5, com: 3 },
    concentrations: [
      { label: '0,25%', mgPerMl: 2.5 },
      { label: '0,5%', mgPerMl: 5 },
    ],
  },
  {
    id: 'ropivacaina',
    name: 'Ropivacaína',
    maxMgPerKg: { sem: 3, com: 3.5 },
    concentrations: [
      { label: '0,2%', mgPerMl: 2 },
      { label: '0,5%', mgPerMl: 5 },
    ],
  },
];

export interface MaxDoseVolume {
  concentration: AnestheticConcentration;
  ml: number;
}

export interface MaxDose {
  anesthetic: LocalAnesthetic;
  epinephrine: Epinephrine;
  mgPerKg: number;
  mg: number;
  /** Volume que leva à dose máxima, em cada concentração. */
  volumes: readonly MaxDoseVolume[];
}

/** Recebe peso já validado (40–200 kg); quem lê o campo usa `evaluateMaxDoses`. */
export function maxDose(
  weightKg: number,
  anesthetic: LocalAnesthetic,
  epinephrine: Epinephrine,
): MaxDose {
  const mgPerKg = anesthetic.maxMgPerKg[epinephrine];
  return {
    anesthetic,
    epinephrine,
    mgPerKg,
    mg: weightKg * mgPerKg,
    volumes: anesthetic.concentrations.map((concentration) => ({
      concentration,
      ml: (weightKg * mgPerKg) / concentration.mgPerMl,
    })),
  };
}

/** mg sem casa decimal, mL com uma: as casas da tela do ANY. */
export function formatDoseMg(mg: number): string {
  return formatQuantity(mg, 'mg', 0);
}

export function formatDoseMl(ml: number): string {
  return formatQuantity(ml, 'mL', 1);
}

export function formatMgPerKg(mgPerKg: number): string {
  return `${formatCompact(mgPerKg)} mg/kg`;
}

/** Emulsão lipídica 20% no LAST, por kg de peso. */
export const LIPID_EMULSION_20 = {
  bolusMlPerKg: 1.5,
  infusionMlPerKgPerMin: 0.25,
  maxMlPerKg: 12,
} as const;

export type LipidEmulsionRowId = 'bolus' | 'infusao' | 'dose-maxima';

export interface LipidEmulsionRow {
  id: LipidEmulsionRowId;
  /** "Bolus (1,5 mL/kg)" */
  label: string;
  value: number;
  /** Valor com unidade, nas casas do ANY ("105 mL", "17,5 mL/min"). */
  text: string;
}

export function lipidEmulsionRows(weightKg: number): readonly LipidEmulsionRow[] {
  const { bolusMlPerKg, infusionMlPerKgPerMin, maxMlPerKg } = LIPID_EMULSION_20;
  const bolus = weightKg * bolusMlPerKg;
  const infusion = weightKg * infusionMlPerKgPerMin;
  const max = weightKg * maxMlPerKg;
  return [
    {
      id: 'bolus',
      label: `Bolus (${formatCompact(bolusMlPerKg)} mL/kg)`,
      value: bolus,
      text: formatQuantity(bolus, 'mL', 0),
    },
    {
      id: 'infusao',
      label: `Infusão (${formatCompact(infusionMlPerKgPerMin)} mL/kg/min)`,
      value: infusion,
      text: formatQuantity(infusion, 'mL/min', 1),
    },
    {
      id: 'dose-maxima',
      label: `Dose máxima (${formatCompact(maxMlPerKg)} mL/kg)`,
      value: max,
      text: formatQuantity(max, 'mL', 0),
    },
  ];
}

/**
 * Resultado de uma conta por peso. Peso vazio, ilegível ou fora de 40–200 kg
 * não vira número: a tela mostra o erro do campo e nada mais.
 */
export type WeightBasedEvaluation<T> =
  | { status: 'pending'; error: NumericFieldError | null }
  | { status: 'complete'; weightKg: number; result: T };

function withAdultWeight<T>(
  raw: string,
  compute: (weightKg: number) => T,
): WeightBasedEvaluation<T> {
  const checked = validateWeight(raw, 'adulto');
  if (!checked.ok) {
    return { status: 'pending', error: checked.error.kind === 'empty' ? null : checked.error };
  }
  return { status: 'complete', weightKg: checked.value, result: compute(checked.value) };
}

export interface MaxDoseRow {
  anesthetic: LocalAnesthetic;
  doses: Record<Epinephrine, MaxDose>;
}

export function maxDoseTable(weightKg: number): readonly MaxDoseRow[] {
  return LOCAL_ANESTHETICS.map((anesthetic) => ({
    anesthetic,
    doses: {
      sem: maxDose(weightKg, anesthetic, 'sem'),
      com: maxDose(weightKg, anesthetic, 'com'),
    },
  }));
}

export function evaluateMaxDoses(rawWeight: string): WeightBasedEvaluation<readonly MaxDoseRow[]> {
  return withAdultWeight(rawWeight, maxDoseTable);
}

export function evaluateLipidEmulsion(
  rawWeight: string,
): WeightBasedEvaluation<readonly LipidEmulsionRow[]> {
  return withAdultWeight(rawWeight, lipidEmulsionRows);
}

function weightLabel(weightKg: number): string {
  return `${formatCompact(weightKg)} kg`;
}

/**
 * Texto para o prontuário da dose máxima: peso, mg e mL de cada anestésico,
 * com e sem epinefrina, e o aviso de redução. Sem dado de paciente.
 */
export function buildMaxDoseNote(weightKg: number): string {
  const lines = [`Dose máxima de anestésico local (peso ${weightLabel(weightKg)}):`];
  for (const { anesthetic, doses } of maxDoseTable(weightKg)) {
    for (const epinephrine of EPINEPHRINE_OPTIONS) {
      const dose = doses[epinephrine];
      const volumes = dose.volumes
        .map(({ concentration, ml }) => `${concentration.label}: ${formatDoseMl(ml)}`)
        .join('; ');
      lines.push(
        `- ${anesthetic.name} ${EPINEPHRINE_LABEL[epinephrine].toLowerCase()} (${formatMgPerKg(dose.mgPerKg)}): ${formatDoseMg(dose.mg)} — ${volumes}`,
      );
    }
  }
  lines.push(`Sugestão: ${MAX_DOSE_NOTICE.text}`);
  return lines.join('\n');
}

/** Texto para o prontuário da emulsão lipídica no LAST. */
export function buildLipidEmulsionNote(weightKg: number): string {
  return [
    `LAST — emulsão lipídica 20% (peso ${weightLabel(weightKg)}):`,
    ...lipidEmulsionRows(weightKg).map(({ label, text }) => `- ${label}: ${text}`),
  ].join('\n');
}
