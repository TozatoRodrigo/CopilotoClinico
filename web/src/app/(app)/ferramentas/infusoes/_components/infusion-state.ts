import {
  checkCustomDilutionValues,
  describePreparation,
  type CustomDilution,
} from '@clinical-tools/infusions/custom-dilution';
import { doseInputRange, doseSettings } from '@clinical-tools/infusions/dose';
import { getInfusionDrug, type InfusionDrug } from '@clinical-tools/infusions/drugs';
import type { HeparinIndication } from '@clinical-tools/infusions/heparin';
import { findInfusionItem } from '@clinical-tools/infusions/items';

/**
 * Estado da tela de Infusões que sobrevive a ir e voltar (sessionStorage, ver
 * tool-session.ts): por droga, modo, dose e diluição; nos protocolos, a fase e
 * os valores digitados. O item aberto fica numa chave à parte. Só números e
 * ids — nada que identifique paciente.
 */

/** De onde vem a concentração em uso. */
export type DilutionChoice =
  /** Padrão ou uma das alternativas do ANY (dobrada, quádrupla). */
  | { kind: 'lista'; concentration: number }
  /** A diluição salva no aparelho para esta droga. */
  | { kind: 'minha' }
  /** Diluição própria aplicada sem salvar ("só desta vez"). */
  | { kind: 'desta-vez'; ampoules: number; volume: number };

export interface DrugScreenState {
  modeId: string | null;
  /** Dose em vigor (a última válida digitada, deslizada ou do botão). */
  dose: number;
  dilution: DilutionChoice;
}

export type ProtocolPhase = 'inicio' | 'ajuste';

/** Heparina (CC-312): fase, indicação e o texto digitado em cada campo. */
export interface HeparinScreenState {
  phase: ProtocolPhase;
  indication: HeparinIndication;
  ratio: string;
  currentDose: string;
}

/** Insulina (CC-312): fase e o texto digitado em cada campo. */
export interface InsulinScreenState {
  phase: ProtocolPhase;
  initial: string;
  current: string;
  previous: string;
  currentInfusion: string;
}

export interface InfusionScreenState {
  /** Modo, dose e diluição por droga. */
  drugs: Readonly<Record<string, DrugScreenState>>;
  heparin: HeparinScreenState;
  insulin: InsulinScreenState;
}

export const EMPTY_HEPARIN_STATE: HeparinScreenState = {
  phase: 'inicio',
  indication: 'sca',
  ratio: '',
  currentDose: '',
};

export const EMPTY_INSULIN_STATE: InsulinScreenState = {
  phase: 'inicio',
  initial: '',
  current: '',
  previous: '',
  currentInfusion: '',
};

export const EMPTY_INFUSION_STATE: InfusionScreenState = {
  drugs: {},
  heparin: EMPTY_HEPARIN_STATE,
  insulin: EMPTY_INSULIN_STATE,
};

/** Id de item salvo na sessão; o que não for item conhecido vira "nenhum". */
export function parseOpenItem(value: unknown): string | null {
  return typeof value === 'string' && findInfusionItem(value) ? value : null;
}

export function initialDrugState(
  drug: InfusionDrug,
  saved: CustomDilution | null,
): DrugScreenState {
  const settings = doseSettings(drug);
  return {
    modeId: settings.mode?.id ?? null,
    dose: settings.defaultDose,
    // Como no ANY: a diluição salva manda assim que a droga abre.
    dilution: saved ? { kind: 'minha' } : { kind: 'lista', concentration: drug.concentration },
  };
}

export interface ResolvedDilution {
  concentration: number;
  /** Preparo por extenso para conferir contra a bolsa. */
  description: string;
  kind: 'padrao' | 'alternativa' | 'minha' | 'desta-vez';
}

/**
 * Concentração e texto da diluição escolhida. Escolha que deixou de valer
 * (diluição apagada, alternativa que não existe mais) volta ao padrão, nunca a
 * uma concentração sem preparo conhecido.
 */
export function resolveDilution(
  drug: InfusionDrug,
  choice: DilutionChoice,
  saved: CustomDilution | null,
): ResolvedDilution {
  const standard: ResolvedDilution = {
    concentration: drug.concentration,
    description: drug.presentation,
    kind: 'padrao',
  };
  switch (choice.kind) {
    case 'lista': {
      if (choice.concentration === drug.concentration) return standard;
      const alternative = drug.dilutions?.find(
        ({ concentration }) => concentration === choice.concentration,
      );
      // O ANY mostrava o preparo padrão junto da concentração dobrada; aqui
      // vai só o rótulo da alternativa, que é o que o ANY sabe dela.
      return alternative
        ? {
            concentration: alternative.concentration,
            description: alternative.label,
            kind: 'alternativa',
          }
        : standard;
    }
    case 'minha':
      return saved
        ? {
            concentration: saved.concentration,
            description: describePreparation(drug, saved.ampoules, saved.volume),
            kind: 'minha',
          }
        : standard;
    case 'desta-vez': {
      const check = checkCustomDilutionValues(drug, choice.ampoules, choice.volume);
      return check.status === 'valida'
        ? {
            concentration: check.dilution.concentration,
            description: describePreparation(drug, choice.ampoules, choice.volume),
            kind: 'desta-vez',
          }
        : standard;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseDilution(value: unknown): DilutionChoice | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'lista' && isFiniteNumber(value.concentration)) {
    return { kind: 'lista', concentration: value.concentration };
  }
  if (value.kind === 'minha') return { kind: 'minha' };
  if (
    value.kind === 'desta-vez' &&
    isFiniteNumber(value.ampoules) &&
    isFiniteNumber(value.volume)
  ) {
    return { kind: 'desta-vez', ampoules: value.ampoules, volume: value.volume };
  }
  return null;
}

function parseDrugState(drug: InfusionDrug, value: unknown): DrugScreenState | null {
  if (!isRecord(value)) return null;
  const modeId =
    typeof value.modeId === 'string' && drug.modes?.some(({ id }) => id === value.modeId)
      ? value.modeId
      : null;
  if (drug.modes && modeId === null) return null;
  const dilution = parseDilution(value.dilution);
  const settings = doseSettings(drug, modeId);
  const range = doseInputRange(drug, settings);
  if (
    !dilution ||
    !isFiniteNumber(value.dose) ||
    value.dose < range.min ||
    value.dose > range.max
  ) {
    return null;
  }
  return { modeId, dose: value.dose, dilution };
}

/** Texto curto digitado num campo (o campo valida; aqui só se barra lixo). */
function field(value: unknown): string {
  return typeof value === 'string' && value.length <= 20 ? value : '';
}

function phase(value: unknown): ProtocolPhase {
  return value === 'ajuste' ? 'ajuste' : 'inicio';
}

function parseHeparin(value: unknown): HeparinScreenState {
  if (!isRecord(value)) return EMPTY_HEPARIN_STATE;
  return {
    phase: phase(value.phase),
    indication: value.indication === 'tep' ? 'tep' : 'sca',
    ratio: field(value.ratio),
    currentDose: field(value.currentDose),
  };
}

function parseInsulin(value: unknown): InsulinScreenState {
  if (!isRecord(value)) return EMPTY_INSULIN_STATE;
  return {
    phase: phase(value.phase),
    initial: field(value.initial),
    current: field(value.current),
    previous: field(value.previous),
    currentInfusion: field(value.currentInfusion),
  };
}

/** Lê o estado salvo; o que não for reconhecido some sem quebrar a tela. */
export function parseInfusionScreenState(value: unknown): InfusionScreenState | null {
  if (!isRecord(value)) return null;
  const drugs: Record<string, DrugScreenState> = {};
  if (isRecord(value.drugs)) {
    for (const [id, state] of Object.entries(value.drugs)) {
      const drug = getInfusionDrug(id);
      const parsed = drug ? parseDrugState(drug, state) : null;
      if (parsed) drugs[id] = parsed;
    }
  }
  return { drugs, heparin: parseHeparin(value.heparin), insulin: parseInsulin(value.insulin) };
}
