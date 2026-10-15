import { validateNumber } from '../ranges';
import {
  AIRWAY_STEPS,
  CORMACK_GRADES,
  CRASH_LETTERS,
  FIRST_STEP,
  INDICATIONS,
  isAirwayCheckId,
  isAirwayStep,
  LARYNGOSCOPY_TECHNIQUES,
  LEMON_ITEMS,
  MEMBRANE_METHODS,
  POPULATIONS,
  RESCUE_METHODS,
  ROMAN_ITEMS,
  SEXES,
  type AirwayCheckId,
  type AirwayPopulation,
  type AirwayStepNumber,
  type BiologicalSex,
  type CormackGrade,
  type CrashLetter,
  type IndicationId,
  type LaryngoscopyTechnique,
  type LemonId,
  type MembraneMethod,
  type RescueMethod,
  type RomanId,
} from './content';
import {
  AIRWAY_DRUG_IDS,
  AIRWAY_DRUGS,
  getAirwayDrug,
  isExclusiveCategory,
  snapRate,
  type AirwayDrugId,
} from './drugs';
import { AIRWAY_RANGES, airwayShockIndex, type AirwayShockIndex } from './vitals';

/**
 * Estado do roteiro de via aérea como reducer puro (CC-315): passo atual,
 * respostas, sinais vitais, medicações escolhidas e desfecho. É o
 * `airwayReducer` do ANY reescrito com tipos fechados; o teste diferencial
 * (tests/clinical-tools) roda os dois lado a lado.
 *
 * O peso não mora aqui: é o peso adulto comum às ferramentas, e as contas o
 * recebem de fora (`deriveAirway`).
 */

export const AIRWAY_SCREENS = ['inicio', 'roteiro', 'checklist', 'doses'] as const;
export type AirwayScreen = (typeof AIRWAY_SCREENS)[number];

export type VadAssessment = 'avaliar' | 'sem-avaliar';

/**
 * Desfecho da intubação (passo 10). "Intubou? Não" abre o plano B; se ele
 * falha, o plano C (cricotireoidostomia).
 */
export type AirwayOutcome =
  | { status: 'pendente' }
  | { status: 'intubado' }
  | { status: 'falhou'; planC: boolean }
  | { status: 'resgatado'; method: RescueMethod };

export interface AirwayState {
  screen: AirwayScreen;
  step: AirwayStepNumber;
  indications: readonly IndicationId[];
  crash: readonly CrashLetter[];
  /**
   * H marcado pelo índice de choque > 1,0, e não pelo médico. No ANY isso
   * gerava um aviso que nunca aparecia na tela; aqui a tela mostra.
   */
  hFromShockIndex: boolean;
  /** Texto digitado (vírgula ou ponto); validado nas contas. */
  heartRate: string;
  systolic: string;
  vadAssessment: VadAssessment | null;
  lemon: readonly LemonId[];
  roman: readonly RomanId[];
  height: string;
  sex: BiologicalSex | null;
  population: AirwayPopulation;
  membrane: MembraneMethod | null;
  /** Medicações selecionadas, na ordem da lista. */
  drugs: readonly AirwayDrugId[];
  /** Dose por kg escolhida na régua de cada droga. */
  rates: Readonly<Record<AirwayDrugId, number>>;
  technique: LaryngoscopyTechnique;
  cormack: CormackGrade | null;
  depth: string;
  cuff: string;
  outcome: AirwayOutcome;
  /** Itens de checklist marcados. */
  checked: readonly AirwayCheckId[];
}

export type AirwayAction =
  | { type: 'open-screen'; screen: AirwayScreen }
  | { type: 'go-to-step'; step: AirwayStepNumber }
  | { type: 'toggle-indication'; id: IndicationId }
  | { type: 'toggle-crash'; letter: CrashLetter }
  | { type: 'set-heart-rate'; raw: string }
  | { type: 'set-systolic'; raw: string }
  | { type: 'set-vad-assessment'; value: VadAssessment }
  | { type: 'toggle-lemon'; id: LemonId }
  | { type: 'toggle-roman'; id: RomanId }
  | { type: 'set-height'; raw: string }
  | { type: 'set-sex'; sex: BiologicalSex }
  | { type: 'set-population'; population: AirwayPopulation }
  | { type: 'set-membrane'; method: MembraneMethod }
  | { type: 'toggle-drug'; drug: AirwayDrugId }
  | { type: 'set-drug-rate'; drug: AirwayDrugId; rate: number }
  | { type: 'set-technique'; technique: LaryngoscopyTechnique }
  | { type: 'set-cormack'; grade: CormackGrade }
  | { type: 'set-depth'; raw: string }
  | { type: 'set-cuff'; raw: string }
  | { type: 'record-intubation'; success: boolean }
  | { type: 'rescue-with-deg' }
  | { type: 'plan-b-failed' }
  | { type: 'crico-established' }
  | { type: 'clear-outcome' }
  | { type: 'toggle-check'; id: AirwayCheckId }
  | { type: 'reset' };

const INITIAL_RATES = Object.fromEntries(
  AIRWAY_DRUGS.map(({ id, rate }) => [id, rate.initial]),
) as Record<AirwayDrugId, number>;

export const INITIAL_AIRWAY_STATE: AirwayState = {
  screen: 'inicio',
  step: FIRST_STEP,
  indications: [],
  crash: [],
  hFromShockIndex: false,
  heartRate: '',
  systolic: '',
  vadAssessment: null,
  lemon: [],
  roman: [],
  height: '',
  sex: null,
  population: 'adulto',
  membrane: null,
  drugs: [],
  rates: INITIAL_RATES,
  technique: 'direta',
  cormack: null,
  depth: '',
  cuff: '',
  outcome: { status: 'pendente' },
  checked: [],
};

/** Liga ou desliga um id mantendo a ordem da definição (resumo e testes estáveis). */
function toggleIn<Id extends string>(
  list: readonly Id[],
  id: Id,
  order: readonly Id[],
): readonly Id[] {
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return order.filter((item) => next.includes(item));
}

const INDICATION_ORDER = INDICATIONS.map(({ id }) => id);
const LEMON_ORDER = LEMON_ITEMS.map(({ id }) => id);
const ROMAN_ORDER = ROMAN_ITEMS.map(({ id }) => id);

/** Índice de choque com FC e PAS válidas (dentro da faixa); senão `null`. */
export function shockIndexOf(
  state: Pick<AirwayState, 'heartRate' | 'systolic'>,
): AirwayShockIndex | null {
  const heartRate = validateNumber(state.heartRate, AIRWAY_RANGES.heartRate);
  const systolic = validateNumber(state.systolic, AIRWAY_RANGES.systolic);
  if (!heartRate.ok || !systolic.ok) return null;
  return airwayShockIndex(heartRate.value, systolic.value);
}

/**
 * Regra do ANY: ao digitar FC ou PAS, índice de choque > 1,0 marca o H se ele
 * ainda não estiver marcado. Nunca desmarca: quem desmarca é o médico.
 */
function markHFromShockIndex(state: AirwayState): AirwayState {
  if (state.crash.includes('H') || !shockIndexOf(state)?.marksH) return state;
  return {
    ...state,
    crash: toggleIn(state.crash, 'H', CRASH_LETTERS),
    hFromShockIndex: true,
  };
}

/** Indutor e BNM: escolher um desmarca o outro da mesma categoria (`TOGGLE_MED` do ANY). */
function toggleDrug(selected: readonly AirwayDrugId[], id: AirwayDrugId): readonly AirwayDrugId[] {
  const drug = getAirwayDrug(id);
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  const kept = isExclusiveCategory(drug.category)
    ? selected.filter((item) => getAirwayDrug(item).category !== drug.category)
    : selected;
  return AIRWAY_DRUG_IDS.filter((item) => item === id || kept.includes(item));
}

/** Respostas possíveis no passo 10, com o rótulo do botão (o mesmo do ANY). */
export const OUTCOME_CHOICES = {
  intubou: { label: 'Sim', action: { type: 'record-intubation', success: true } },
  'nao-intubou': { label: 'Não', action: { type: 'record-intubation', success: false } },
  'resgate-deg': { label: 'Resgatou com DEG', action: { type: 'rescue-with-deg' } },
  'plano-b-falhou': { label: 'Falhou — Plano C', action: { type: 'plan-b-failed' } },
  'crico-estabelecida': { label: 'Via aérea estabelecida', action: { type: 'crico-established' } },
} as const satisfies Record<string, { label: string; action: AirwayAction }>;

export type OutcomeChoice = keyof typeof OUTCOME_CHOICES;

/**
 * O que dá para responder em cada desfecho: "Intubou?" (Sim/Não); na falha, o
 * plano B (resgatou com DEG ou falhou); com o plano C aberto, também a
 * cricotireoidostomia. Com a via aérea estabelecida não há mais pergunta.
 */
export function outcomeChoices(outcome: AirwayOutcome): readonly OutcomeChoice[] {
  switch (outcome.status) {
    case 'pendente':
      return ['intubou', 'nao-intubou'];
    case 'falhou':
      // Com o plano C aberto, "Falhou — Plano C" não faz mais nada: sai da tela.
      return outcome.planC
        ? ['resgate-deg', 'crico-estabelecida']
        : ['resgate-deg', 'plano-b-falhou'];
    case 'intubado':
    case 'resgatado':
      return [];
  }
}

function nextOutcome(outcome: AirwayOutcome, action: AirwayAction): AirwayOutcome {
  switch (action.type) {
    case 'record-intubation':
      if (outcome.status !== 'pendente') return outcome;
      return action.success ? { status: 'intubado' } : { status: 'falhou', planC: false };
    case 'rescue-with-deg':
      return outcome.status === 'falhou' ? { status: 'resgatado', method: 'deg' } : outcome;
    case 'plan-b-failed':
      return outcome.status === 'falhou' ? { status: 'falhou', planC: true } : outcome;
    case 'crico-established':
      return outcome.status === 'falhou' && outcome.planC
        ? { status: 'resgatado', method: 'cricotireoidostomia' }
        : outcome;
    case 'clear-outcome':
      return { status: 'pendente' };
    default:
      return outcome;
  }
}

export function airwayReducer(state: AirwayState, action: AirwayAction): AirwayState {
  switch (action.type) {
    case 'open-screen':
      return { ...state, screen: action.screen };
    case 'go-to-step':
      return { ...state, screen: 'roteiro', step: action.step };
    case 'toggle-indication':
      return { ...state, indications: toggleIn(state.indications, action.id, INDICATION_ORDER) };
    case 'toggle-crash':
      return {
        ...state,
        crash: toggleIn(state.crash, action.letter, CRASH_LETTERS),
        // Mexer no H é decisão do médico: o aviso de marcação automática sai.
        hFromShockIndex: action.letter === 'H' ? false : state.hFromShockIndex,
      };
    case 'set-heart-rate':
      return markHFromShockIndex({ ...state, heartRate: action.raw });
    case 'set-systolic':
      return markHFromShockIndex({ ...state, systolic: action.raw });
    case 'set-vad-assessment':
      // "Continuar sem avaliar" já leva aos dados do paciente, como no ANY.
      return action.value === 'sem-avaliar'
        ? { ...state, vadAssessment: action.value, step: 4 }
        : { ...state, vadAssessment: action.value };
    case 'toggle-lemon':
      return { ...state, lemon: toggleIn(state.lemon, action.id, LEMON_ORDER) };
    case 'toggle-roman':
      return { ...state, roman: toggleIn(state.roman, action.id, ROMAN_ORDER) };
    case 'set-height':
      return { ...state, height: action.raw };
    case 'set-sex':
      return { ...state, sex: action.sex };
    case 'set-population':
      return { ...state, population: action.population };
    case 'set-membrane':
      return { ...state, membrane: action.method };
    case 'toggle-drug':
      return { ...state, drugs: toggleDrug(state.drugs, action.drug) };
    case 'set-drug-rate':
      return {
        ...state,
        rates: { ...state.rates, [action.drug]: snapRate(getAirwayDrug(action.drug), action.rate) },
      };
    case 'set-technique':
      return { ...state, technique: action.technique };
    case 'set-cormack':
      return { ...state, cormack: action.grade };
    case 'set-depth':
      return { ...state, depth: action.raw };
    case 'set-cuff':
      return { ...state, cuff: action.raw };
    case 'record-intubation':
    case 'rescue-with-deg':
    case 'plan-b-failed':
    case 'crico-established':
    case 'clear-outcome':
      return { ...state, outcome: nextOutcome(state.outcome, action) };
    case 'toggle-check':
      return {
        ...state,
        checked: state.checked.includes(action.id)
          ? state.checked.filter((id) => id !== action.id)
          : [...state.checked, action.id],
      };
    case 'reset':
      return INITIAL_AIRWAY_STATE;
  }
}

/** Já há algo respondido no roteiro (a tela aberta não conta)? */
export function hasAirwayProgress(state: AirwayState): boolean {
  const keys = Object.keys(INITIAL_AIRWAY_STATE) as (keyof AirwayState)[];
  return keys.some(
    (key) =>
      key !== 'screen' && JSON.stringify(state[key]) !== JSON.stringify(INITIAL_AIRWAY_STATE[key]),
  );
}

// ---- Leitura do estado salvo na aba -----------------------------------------

const MAX_TEXT_LENGTH = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string | number>(allowed: readonly T[], value: unknown): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

function idsOf<T extends string>(allowed: readonly T[], value: unknown): readonly T[] | null {
  if (!Array.isArray(value) || !value.every((item) => oneOf(allowed, item))) return null;
  return allowed.filter((id) => value.includes(id));
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH ? value : null;
}

function parseOutcome(value: unknown): AirwayOutcome | null {
  if (!isRecord(value)) return null;
  switch (value.status) {
    case 'pendente':
    case 'intubado':
      return { status: value.status };
    case 'falhou':
      return typeof value.planC === 'boolean' ? { status: 'falhou', planC: value.planC } : null;
    case 'resgatado':
      return oneOf(
        RESCUE_METHODS.map(({ id }) => id),
        value.method,
      )
        ? { status: 'resgatado', method: value.method }
        : null;
    default:
      return null;
  }
}

function parseRates(value: unknown): Record<AirwayDrugId, number> | null {
  if (!isRecord(value)) return null;
  const rates = { ...INITIAL_RATES };
  for (const id of AIRWAY_DRUG_IDS) {
    const rate = value[id];
    if (typeof rate !== 'number') return null;
    // Régua fora da faixa ou do passo (versão antiga) volta para a régua.
    rates[id] = snapRate(getAirwayDrug(id), rate);
  }
  return rates;
}

/**
 * Lê o estado salvo na aba sem confiar no formato: campo ausente, de outra
 * versão ou editado à mão devolve `null`, e o roteiro começa do zero.
 */
export function parseAirwayState(value: unknown): AirwayState | null {
  if (!isRecord(value)) return null;
  const indications = idsOf(INDICATION_ORDER, value.indications);
  const crash = idsOf(CRASH_LETTERS, value.crash);
  const lemon = idsOf(LEMON_ORDER, value.lemon);
  const roman = idsOf(ROMAN_ORDER, value.roman);
  const drugs = idsOf(AIRWAY_DRUG_IDS, value.drugs);
  const rates = parseRates(value.rates);
  const outcome = parseOutcome(value.outcome);
  const heartRate = text(value.heartRate);
  const systolic = text(value.systolic);
  const height = text(value.height);
  const depth = text(value.depth);
  const cuff = text(value.cuff);
  const checked =
    Array.isArray(value.checked) && value.checked.every(isAirwayCheckId)
      ? [...new Set(value.checked)]
      : null;

  if (
    !oneOf(AIRWAY_SCREENS, value.screen) ||
    !isAirwayStep(value.step) ||
    !indications ||
    !crash ||
    typeof value.hFromShockIndex !== 'boolean' ||
    heartRate === null ||
    systolic === null ||
    !(
      value.vadAssessment === null ||
      oneOf(['avaliar', 'sem-avaliar'] as const, value.vadAssessment)
    ) ||
    !lemon ||
    !roman ||
    height === null ||
    !(
      value.sex === null ||
      oneOf(
        SEXES.map(({ id }) => id),
        value.sex,
      )
    ) ||
    !oneOf(
      POPULATIONS.map(({ id }) => id),
      value.population,
    ) ||
    !(
      value.membrane === null ||
      oneOf(
        MEMBRANE_METHODS.map(({ id }) => id),
        value.membrane,
      )
    ) ||
    !drugs ||
    !rates ||
    !oneOf(
      LARYNGOSCOPY_TECHNIQUES.map(({ id }) => id),
      value.technique,
    ) ||
    !(value.cormack === null || oneOf(CORMACK_GRADES, value.cormack)) ||
    depth === null ||
    cuff === null ||
    !outcome ||
    !checked
  ) {
    return null;
  }

  return {
    screen: value.screen,
    step: value.step,
    indications,
    crash,
    // H automático sem o H marcado não existe: o aviso só vale com o H.
    hFromShockIndex: value.hFromShockIndex && crash.includes('H'),
    heartRate,
    systolic,
    vadAssessment: value.vadAssessment,
    lemon,
    roman,
    height,
    sex: value.sex,
    population: value.population,
    membrane: value.membrane,
    drugs: toggleSafeDrugs(drugs),
    rates,
    technique: value.technique,
    cormack: value.cormack,
    depth,
    cuff,
    outcome,
    checked,
  };
}

/** Garante no máximo um indutor e um BNM num estado lido de fora. */
function toggleSafeDrugs(drugs: readonly AirwayDrugId[]): readonly AirwayDrugId[] {
  return drugs.reduce<readonly AirwayDrugId[]>(
    (selected, id) => (selected.includes(id) ? selected : toggleDrug(selected, id)),
    [],
  );
}

/** Passos do roteiro, para a tela e os testes. */
export const AIRWAY_STEP_NUMBERS: readonly AirwayStepNumber[] = AIRWAY_STEPS.map(
  ({ number }) => number,
);
