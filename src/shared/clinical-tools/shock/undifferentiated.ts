import { formatCompact, formatDecimal } from '../numbers';
import {
  describePerfusionInputs,
  PERFUSION_INPUTS,
  type PerfusionEvaluation,
  type PerfusionInputId,
} from './perfusion-quadrant';
import {
  EMPTY_GREY_ZONE,
  EMPTY_LOW_OUTPUT_ANSWERS,
  INITIAL_VTI_STATE,
  VTI_SCREENS,
  VTI_SHOCK_TYPES,
  vtiReducer,
  type VtiAction,
  type VtiState,
} from './vti';
import { VNERI_INPUTS, type VneriEvaluation, type VneriInputId } from './vneri';

/**
 * Estado da tela do choque indiferenciado (CC-317): a aba aberta, o algoritmo
 * do VTI e os campos do VNERi e do gap CO2 × SvcO2 avulsos. Reducer puro,
 * salvo na sessão da aba como o roteiro do choque séptico.
 */

export const UNDIFFERENTIATED_TABS = [
  { id: 'vti', label: 'VTI' },
  { id: 'vneri', label: 'VNERi' },
  { id: 'gap', label: 'Gap CO2 × SvcO2' },
] as const;
export type UndifferentiatedTab = (typeof UNDIFFERENTIATED_TABS)[number]['id'];

export interface UndifferentiatedShockState {
  tab: UndifferentiatedTab;
  vti: VtiState;
  vneri: Readonly<Record<VneriInputId, string>>;
  perfusion: Readonly<Record<PerfusionInputId, string>>;
}

export type UndifferentiatedShockAction =
  | { type: 'aba'; tab: UndifferentiatedTab }
  | { type: 'vti'; action: VtiAction }
  | { type: 'vneri'; field: VneriInputId; raw: string }
  | { type: 'perfusao'; field: PerfusionInputId; raw: string }
  /** Outro paciente: tudo volta ao início, na mesma aba. */
  | { type: 'recomecar' };

export const INITIAL_UNDIFFERENTIATED_STATE: UndifferentiatedShockState = {
  tab: 'vti',
  vti: INITIAL_VTI_STATE,
  vneri: { pad: '', fc: '', doseNE: '' },
  perfusion: { svco2: '', gapCO2: '' },
};

export function undifferentiatedShockReducer(
  state: UndifferentiatedShockState,
  action: UndifferentiatedShockAction,
): UndifferentiatedShockState {
  switch (action.type) {
    case 'aba':
      return { ...state, tab: action.tab };
    case 'vti':
      return { ...state, vti: vtiReducer(state.vti, action.action) };
    case 'vneri':
      return { ...state, vneri: { ...state.vneri, [action.field]: action.raw } };
    case 'perfusao':
      return { ...state, perfusion: { ...state.perfusion, [action.field]: action.raw } };
    case 'recomecar':
      return { ...INITIAL_UNDIFFERENTIATED_STATE, tab: state.tab };
  }
}

// ---- Prontuário ----

/** VNERi avulso para o prontuário: valor, zona, mortalidade, entradas e conduta. */
export function buildVneriChartNote(
  evaluation: Extract<VneriEvaluation, { status: 'complete' }>,
  citation: string,
): string {
  const { value, zone, conduct, inputs } = evaluation;
  return [
    `VNERi: ${formatDecimal(value, 1)} — ${zone.label} (mortalidade ${zone.mortality}).`,
    `- PAD: ${formatCompact(inputs.pad)} ${VNERI_INPUTS.pad.unit}`,
    `- FC: ${formatCompact(inputs.fc)} ${VNERI_INPUTS.fc.unit}`,
    `- Dose de noradrenalina: ${formatCompact(inputs.doseNE)} ${VNERI_INPUTS.doseNE.unit}`,
    `Sugestão: ${conduct.text}`,
    `Referência: ${citation}`,
  ].join('\n');
}

/** Quadrante avulso para o prontuário. */
export function buildPerfusionChartNote(
  evaluation: Extract<PerfusionEvaluation, { status: 'complete' }>,
  citation: string,
): string {
  return [
    `Gap CO2 × SvcO2: ${evaluation.quadrant.label}.`,
    `- ${describePerfusionInputs(evaluation.svco2, evaluation.gapCO2)}`,
    `Sugestão: ${evaluation.quadrant.conduct}`,
    `Referência: ${citation}`,
  ].join('\n');
}

// ---- Estado salvo na sessão ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function shortText(value: unknown): string {
  return typeof value === 'string' && value.length <= 20 ? value : '';
}

function yesNo(value: unknown): 'sim' | 'nao' | null {
  return oneOf(value, ['sim', 'nao'] as const) ? value : null;
}

function texts<K extends string>(value: unknown, keys: readonly K[]): Record<K, string> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(keys.map((key) => [key, shortText(source[key])])) as Record<K, string>;
}

function parseVtiState(value: unknown): VtiState {
  if (!isRecord(value) || !oneOf(value.screen, VTI_SCREENS)) return INITIAL_VTI_STATE;
  const low = isRecord(value.lowOutput) ? value.lowOutput : {};
  const grey = isRecord(value.greyZone) ? value.greyZone : {};
  return {
    screen: value.screen,
    vtiRaw: shortText(value.vtiRaw),
    lowOutput: {
      ...EMPTY_LOW_OUTPUT_ANSWERS,
      pericardio: yesNo(low.pericardio),
      vd: yesNo(low.vd),
      ve: yesNo(low.ve),
      valvar: yesNo(low.valvar),
      ventilation: oneOf(low.ventilation, ['espontanea', 'mecanica'] as const)
        ? low.ventilation
        : null,
      fluidResponsive: yesNo(low.fluidResponsive),
    },
    greyZone: {
      ...EMPTY_GREY_ZONE,
      svco2: shortText(grey.svco2),
      gapCO2: shortText(grey.gapCO2),
      lactateTrend: oneOf(grey.lactateTrend, ['crescente', 'estavel'] as const)
        ? grey.lactateTrend
        : null,
    },
    shockType: oneOf(value.shockType, VTI_SHOCK_TYPES) ? value.shockType : null,
  };
}

/** Lido sem confiar no formato: o que não for reconhecível volta ao inicial. */
export function parseUndifferentiatedShockState(value: unknown): UndifferentiatedShockState | null {
  if (!isRecord(value)) return null;
  return {
    tab: oneOf(
      value.tab,
      UNDIFFERENTIATED_TABS.map(({ id }) => id),
    )
      ? value.tab
      : 'vti',
    vti: parseVtiState(value.vti),
    vneri: texts(value.vneri, Object.keys(VNERI_INPUTS) as VneriInputId[]),
    perfusion: texts(value.perfusion, Object.keys(PERFUSION_INPUTS) as PerfusionInputId[]),
  };
}
