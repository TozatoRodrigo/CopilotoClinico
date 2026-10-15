import { formatCompact, formatDecimal } from '../numbers';

/**
 * Drogas em bolus por peso (CC-319): a definição é dado e o motor só faz a
 * conta. Cada forma de dose do PedGuide v4 virou um tipo; a conta segue a
 * mesma ordem de operações do ANY, porque o arredondamento de `toFixed` lê o
 * valor em ponto flutuante e uma ordem diferente muda a última casa (o teste
 * diferencial compara texto com texto).
 */

/** Uma dose por kg com teto e piso opcionais: `max(piso, min(peso × dose, teto))`. */
export interface DoseLeg {
  perKg: number;
  cap?: number;
  floor?: number;
  /** Nome da dose quando há duas ("IM", "EV", "1ª dose"). */
  label?: string;
}

/** Como o volume sai da dose. */
export type VolumeRule =
  /** mL = dose ÷ concentração (na unidade da dose por mL). */
  | { kind: 'concentracao'; perMl: number; decimals: number; round?: 'para-cima' }
  /** mL = peso × mL/kg, independente da dose (glicose, manitol). */
  | { kind: 'por-kg'; mlPerKg: number; decimals: number }
  /** Sem volume para aspirar (insulina em seringa própria, diluição livre). */
  | { kind: 'sem-volume' };

/** Linha abaixo do resultado: texto fixo ou o volume de soro calculado da dose. */
export type VolumeNote =
  | { kind: 'texto'; text: string }
  | {
      kind: 'soro';
      verb: 'diluir em' | 'completar até';
      /** Volume de soro = dose ÷ este número. */
      dosePerMl: number;
      round?: 'para-cima';
    };

export interface PerKgDose {
  kind: 'por-kg';
  /** Uma dose, ou duas (vias, primeira e segunda dose, ou faixa). */
  legs: readonly [DoseLeg] | readonly [DoseLeg, DoseLeg];
  /** Separador das duas doses: " / " entre vias ou doses, " - " para faixa. */
  join?: ' / ' | ' - ';
  unit: string;
  doseDecimals: number;
  volume: VolumeRule;
  note?: VolumeNote;
}

/** Dose definida pelo volume (NaCl 3%): mL = peso × mL/kg; dose = mL × concentração. */
export interface VolumePerKgDose {
  kind: 'volume-por-kg';
  mlPerKg: number;
  concentration: number;
  unit: string;
  doseDecimals: number;
  volumeDecimals: number;
}

/** Dose que não depende do peso (jatos de inalador). */
export interface FixedDose {
  kind: 'fixa';
  dose: string;
  unit: string;
  note?: string;
}

/** Dose por degrau de peso (ipratrópio em nebulização). */
export interface WeightStepDose {
  kind: 'degrau-de-peso';
  /** Abaixo de `belowKg` vale `lower`; a partir dele, `upper`. */
  belowKg: number;
  lower: { dose: number; note: string };
  upper: { dose: number; note: string };
  unit: string;
  doseDecimals: number;
  volume: Extract<VolumeRule, { kind: 'concentracao' }>;
}

/** Bolus e, junto, a vazão da infusão que segue (emulsão lipídica, insulina em alta dose). */
export interface BolusWithInfusionDose {
  kind: 'bolus-e-infusao';
  bolus: DoseLeg;
  unit: string;
  doseDecimals: number;
  /** Vazão em mL/h = peso × cada valor (uma vazão ou uma faixa "a - b"). */
  infusionMlPerKgPerHour: readonly [number] | readonly [number, number];
  infusionDecimals: number;
  note: string;
}

/** Manutenção de Holliday-Segar com teto (glicose de suporte na intoxicação). */
export interface HollidaySegarDose {
  kind: 'holliday-segar';
  capMlPerHour: number;
  note: string;
}

/** Faixa de idade de uma droga que depende da idade. */
export interface AgeBand {
  /** Vale abaixo desta idade (anos)... */
  belowYears?: number;
  /** ...ou até este peso (kg), o que vier primeiro. */
  upToKg?: number;
  doses: readonly number[];
  note: string;
}

/** Dose por idade (anti-histamínicos): pede a idade antes de calcular. */
export interface AgeBasedDose {
  kind: 'por-idade';
  /** Abaixo desta idade a droga não é recomendada. */
  minimumYears: number;
  belowMinimumMessage: string;
  bands: readonly AgeBand[];
  otherwise: Omit<AgeBand, 'belowYears' | 'upToKg'>;
  unit: string;
}

export type BolusDoseSpec =
  | PerKgDose
  | VolumePerKgDose
  | FixedDose
  | WeightStepDose
  | BolusWithInfusionDose
  | HollidaySegarDose
  | AgeBasedDose;

export type PreparationId = 'epinefrina' | 'nacl3';

export interface BolusDrug {
  /** Id do ANY: é a chave da reconciliação da fonte única (CC-321). */
  id: string;
  name: string;
  presentation: string;
  /** Dose por kg como o ANY escreve ("0,1-0,3 mg/kg"). */
  doseLabel: string;
  /** Ponto da faixa usado na conta, quando `doseLabel` é uma faixa. */
  calculatedAt?: string;
  instruction: string;
  /** Sem indicação de rotina: a tela mostra o selo e o aviso. */
  notRoutine?: boolean;
  /** Destaque fixo do ANY (epinefrina IV e IM). */
  highlight?: boolean;
  preparation?: PreparationId;
  dose: BolusDoseSpec;
}

export interface BolusContext {
  kg: number;
  /** Idade em anos; `null` quando não informada. */
  ageYears: number | null;
}

export type BolusResult =
  | {
      status: 'pronto';
      /** "6,0", "0,10 / 0,20", "4 - 10". */
      dose: string;
      unit: string;
      /** Volume em mL; `null` quando não há volume a aspirar. */
      volume: string | null;
      /**
       * O que o segundo número é: o volume a aspirar (mL) ou, no bolus seguido
       * de infusão, a vazão da infusão (mL/h). O ANY mostrava os dois na mesma
       * caixa "Volume", com a explicação só na linha de baixo.
       */
      volumeKind: 'volume' | 'infusao';
      /** Linha de apoio do volume ("da solução 0,1 mg/mL"). */
      note: string | null;
      /** Alguma dose bateu no teto. */
      capped: boolean;
      /** Alguma dose subiu para o piso. */
      floored: boolean;
    }
  | { status: 'falta-idade' }
  | { status: 'nao-recomendado'; message: string };

interface LegValue {
  value: number;
  capped: boolean;
  floored: boolean;
}

function legValue(leg: DoseLeg, kg: number): LegValue {
  const raw = kg * leg.perKg;
  let value = leg.cap === undefined ? raw : Math.min(raw, leg.cap);
  const capped = value < raw;
  let floored = false;
  if (leg.floor !== undefined && value < leg.floor) {
    value = leg.floor;
    floored = true;
  }
  return { value, capped, floored };
}

function volumeOf(rule: VolumeRule, dose: number, kg: number): string | null {
  switch (rule.kind) {
    case 'concentracao': {
      const ml = dose / rule.perMl;
      return formatDecimal(rule.round === 'para-cima' ? Math.ceil(ml) : ml, rule.decimals);
    }
    case 'por-kg':
      return formatDecimal(kg * rule.mlPerKg, rule.decimals);
    case 'sem-volume':
      return null;
  }
}

function noteOf(note: VolumeNote | undefined, dose: number): string | null {
  if (!note) return null;
  if (note.kind === 'texto') return note.text;
  const ml = dose / note.dosePerMl;
  return `${note.verb} ${formatDecimal(note.round === 'para-cima' ? Math.ceil(ml) : ml, 0)} mL de SF`;
}

/** Holliday-Segar: 4 mL/kg/h até 10 kg, 2 mL/kg/h de 10 a 20 kg, 1 mL/kg/h acima. */
export function hollidaySegarMlPerHour(kg: number): number {
  if (kg <= 10) return kg * 4;
  if (kg <= 20) return 40 + (kg - 10) * 2;
  return 60 + (kg - 20);
}

function perKg(spec: PerKgDose, kg: number): BolusResult {
  const legs = spec.legs.map((leg) => legValue(leg, kg));
  const join = spec.join ?? ' / ';
  const volumes = legs.map(({ value }) => volumeOf(spec.volume, value, kg));
  const first = legs[0] as LegValue;
  return {
    status: 'pronto',
    dose: legs.map(({ value }) => formatDecimal(value, spec.doseDecimals)).join(join),
    unit: spec.unit,
    volume: volumes.every((volume) => volume !== null) ? volumes.join(join) : null,
    volumeKind: 'volume',
    note: noteOf(spec.note, first.value),
    capped: legs.some(({ capped }) => capped),
    floored: legs.some(({ floored }) => floored),
  };
}

function ageBased(spec: AgeBasedDose, context: BolusContext): BolusResult {
  const { ageYears, kg } = context;
  if (ageYears === null) return { status: 'falta-idade' };
  if (ageYears < spec.minimumYears) {
    return { status: 'nao-recomendado', message: spec.belowMinimumMessage };
  }
  const band =
    spec.bands.find(
      (candidate) =>
        (candidate.belowYears !== undefined && ageYears < candidate.belowYears) ||
        (candidate.upToKg !== undefined && kg <= candidate.upToKg),
    ) ?? spec.otherwise;
  return {
    status: 'pronto',
    dose: band.doses.map((dose) => formatCompact(dose)).join(' - '),
    unit: spec.unit,
    volume: null,
    volumeKind: 'volume',
    note: band.note,
    capped: false,
    floored: false,
  };
}

/** Calcula a dose da droga para o peso (e a idade, quando a droga pede). */
export function computeBolus(drug: BolusDrug, context: BolusContext): BolusResult {
  const { kg } = context;
  const spec = drug.dose;
  switch (spec.kind) {
    case 'por-kg':
      return perKg(spec, kg);
    case 'volume-por-kg': {
      const ml = kg * spec.mlPerKg;
      return {
        status: 'pronto',
        dose: formatDecimal(ml * spec.concentration, spec.doseDecimals),
        unit: spec.unit,
        volume: formatDecimal(ml, spec.volumeDecimals),
        volumeKind: 'volume',
        note: null,
        capped: false,
        floored: false,
      };
    }
    case 'fixa':
      return {
        status: 'pronto',
        dose: spec.dose,
        unit: spec.unit,
        volume: null,
        volumeKind: 'volume',
        note: spec.note ?? null,
        capped: false,
        floored: false,
      };
    case 'degrau-de-peso': {
      const step = kg < spec.belowKg ? spec.lower : spec.upper;
      return {
        status: 'pronto',
        dose: formatDecimal(step.dose, spec.doseDecimals),
        unit: spec.unit,
        volume: volumeOf(spec.volume, step.dose, kg),
        volumeKind: 'volume',
        note: step.note,
        capped: false,
        floored: false,
      };
    }
    case 'bolus-e-infusao': {
      const bolus = legValue(spec.bolus, kg);
      return {
        status: 'pronto',
        dose: formatDecimal(bolus.value, spec.doseDecimals),
        unit: spec.unit,
        volume: spec.infusionMlPerKgPerHour
          .map((perKgPerHour) => formatDecimal(kg * perKgPerHour, spec.infusionDecimals))
          .join(' - '),
        volumeKind: 'infusao',
        note: spec.note,
        capped: bolus.capped,
        floored: false,
      };
    }
    case 'holliday-segar': {
      const rate = hollidaySegarMlPerHour(kg);
      return {
        status: 'pronto',
        dose: formatDecimal(Math.min(rate, spec.capMlPerHour), 0),
        unit: 'mL/h',
        volume: null,
        volumeKind: 'volume',
        note: spec.note,
        capped: rate > spec.capMlPerHour,
        floored: false,
      };
    }
    case 'por-idade':
      return ageBased(spec, context);
  }
}

/** O teto da droga por extenso ("10 mg", "10 mg IM · 5 mg EV"); `null` se não há. */
export function describeCap(drug: BolusDrug): string | null {
  const spec = drug.dose;
  if (spec.kind === 'holliday-segar') return `${formatCompact(spec.capMlPerHour)} mL/h`;
  const legs =
    spec.kind === 'por-kg' ? spec.legs : spec.kind === 'bolus-e-infusao' ? [spec.bolus] : [];
  const unit = 'unit' in spec ? spec.unit : '';
  const caps = legs.filter((leg) => leg.cap !== undefined);
  if (caps.length === 0) return null;
  const values = new Set(caps.map((leg) => leg.cap));
  if (values.size === 1) return `${formatCompact(caps[0]?.cap ?? 0)} ${unit}`;
  return caps
    .map((leg) => `${formatCompact(leg.cap ?? 0)} ${unit}${leg.label ? ` ${leg.label}` : ''}`)
    .join(' · ');
}

/** O piso da droga por extenso ("0,1 mg"); `null` se não há. */
export function describeFloor(drug: BolusDrug): string | null {
  const spec = drug.dose;
  if (spec.kind !== 'por-kg') return null;
  const floors = spec.legs.flatMap((leg) => (leg.floor === undefined ? [] : [leg.floor]));
  if (floors.length === 0) return null;
  return `${formatCompact(Math.min(...floors))} ${spec.unit}`;
}
