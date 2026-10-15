import { formatCompact } from '../numbers';
import {
  ACLS_CYCLE_SECONDS,
  ACLS_MEDICATION_IDS,
  ACLS_RHYTHMS,
  aclsMedication,
  AMIODARONE_GUIDE_THRESHOLDS,
  DEFAULT_EPINEPHRINE_INTERVAL_SECONDS,
  EPINEPHRINE_INTERVALS_SECONDS,
  EVENT_TEXT,
  GUIDE_TEXT,
  MAX_VISIBLE_NUDGES,
  NUDGE_TEXT,
  NUDGE_THRESHOLDS,
  RHYTHM_CONTENT,
  type AclsMedicationId,
  type AclsRhythm,
  type EpinephrineIntervalSeconds,
} from './content';
import { ROSC_CHECKLIST_IDS, type RoscChecklistItemId } from './reversible-causes';

/**
 * Estado de uma parada (ACLS) como reducer puro (CC-313): o mesmo
 * `aclsReducer` do ANY, com o tempo vindo de fora. Toda ação que depende do
 * relógio traz `at` (ms desde a época) e todo seletor recebe `now`; nada aqui
 * chama `Date.now()`. Assim o reducer é testável com relógio falso, a tela só
 * despacha, e a parada continua igual quando o médico vai para outra
 * ferramenta e volta.
 */

export type AclsStatus = 'idle' | 'running' | 'finished';
export type AclsOutcome = 'rosc' | 'death';
export type AclsEventType =
  | 'system'
  | 'rhythm'
  | 'cycle'
  | 'med'
  | 'shock'
  | 'etco2'
  | 'fct'
  | 'outcome';

export interface AclsEvent {
  /** Momento do registro (ms desde a época): dá o horário de relógio no relatório. */
  at: number;
  /** Segundos desde o início da parada, como o `time` do ANY. */
  elapsedSeconds: number;
  type: AclsEventType;
  detail: string;
}

export interface AclsState {
  status: AclsStatus;
  startedAt: number | null;
  endedAt: number | null;
  rhythm: AclsRhythm | null;
  /** Ciclos de 2 min completos. */
  cycleCount: number;
  /** Início do ciclo em curso; `null` antes do ritmo e durante a checagem. */
  cycleStartedAt: number | null;
  /** O ciclo acabou e a checagem de ritmo ainda não foi registrada. */
  awaitingRhythmCheck: boolean;
  shockCount: number;
  lastEpinephrineAt: number | null;
  epinephrineIntervalSeconds: EpinephrineIntervalSeconds;
  medicationCounts: Readonly<Partial<Record<AclsMedicationId, number>>>;
  amiodarone300Given: boolean;
  amiodarone150Given: boolean;
  advancedAirway: boolean;
  /** Início da pausa de compressões em curso (FCT). */
  pauseStartedAt: number | null;
  /** Soma das pausas já encerradas, em ms. */
  totalPauseMs: number;
  outcome: AclsOutcome | null;
  events: readonly AclsEvent[];
  /** Itens do checklist pós-RCE já conferidos (CC-314). */
  roscChecklist: readonly RoscChecklistItemId[];
  /** Relatório salvo no histórico do aparelho ao encerrar (CC-314). */
  report: { number: number; recordId: string } | null;
}

export type AclsRhythmCheckResult = AclsRhythm | AclsOutcome;

export type AclsAction =
  | { type: 'start'; at: number }
  | { type: 'select-rhythm'; at: number; rhythm: AclsRhythm }
  | { type: 'complete-cycle'; at: number }
  | { type: 'check-rhythm'; at: number; result: AclsRhythmCheckResult; etco2?: number }
  | { type: 'register-shock'; at: number }
  | { type: 'register-medication'; at: number; medication: AclsMedicationId }
  | { type: 'set-advanced-airway'; at: number; value: boolean }
  | { type: 'set-epinephrine-interval'; seconds: EpinephrineIntervalSeconds }
  | { type: 'toggle-compression-pause'; at: number }
  | { type: 'toggle-rosc-item'; item: RoscChecklistItemId }
  | { type: 'record-report'; number: number; recordId: string }
  | { type: 'discard' };

export const INITIAL_ACLS_STATE: AclsState = {
  status: 'idle',
  startedAt: null,
  endedAt: null,
  rhythm: null,
  cycleCount: 0,
  cycleStartedAt: null,
  awaitingRhythmCheck: false,
  shockCount: 0,
  lastEpinephrineAt: null,
  epinephrineIntervalSeconds: DEFAULT_EPINEPHRINE_INTERVAL_SECONDS,
  medicationCounts: {},
  amiodarone300Given: false,
  amiodarone150Given: false,
  advancedAirway: false,
  pauseStartedAt: null,
  totalPauseMs: 0,
  outcome: null,
  events: [],
  roscChecklist: [],
  report: null,
};

const CYCLE_MS = ACLS_CYCLE_SECONDS * 1000;

/** Segundos inteiros entre o início e `at` (o `getElapsed` do ANY). */
function secondsSinceStart(state: AclsState, at: number): number {
  if (state.startedAt === null) return 0;
  return Math.floor((at - state.startedAt) / 1000);
}

function withEvent(
  state: AclsState,
  at: number,
  type: AclsEventType,
  detail: string,
): readonly AclsEvent[] {
  return [...state.events, { at, elapsedSeconds: secondsSinceStart(state, at), type, detail }];
}

function finish(state: AclsState, at: number, outcome: AclsOutcome): AclsState {
  return {
    ...state,
    status: 'finished',
    outcome,
    endedAt: at,
    cycleStartedAt: null,
    awaitingRhythmCheck: false,
    events: withEvent(
      state,
      at,
      'outcome',
      outcome === 'rosc' ? EVENT_TEXT.rosc : EVENT_TEXT.death,
    ),
  };
}

export function aclsReducer(state: AclsState, action: AclsAction): AclsState {
  if (action.type === 'discard') return INITIAL_ACLS_STATE;
  if (action.type === 'start') {
    if (state.status === 'running') return state;
    return {
      ...INITIAL_ACLS_STATE,
      status: 'running',
      startedAt: action.at,
      events: [{ at: action.at, elapsedSeconds: 0, type: 'system', detail: EVENT_TEXT.started }],
    };
  }
  // Depois do fim só o checklist pós-RCE e o número do relatório mudam.
  if (action.type === 'toggle-rosc-item') {
    if (state.status !== 'finished' || state.outcome !== 'rosc') return state;
    return {
      ...state,
      roscChecklist: state.roscChecklist.includes(action.item)
        ? state.roscChecklist.filter((item) => item !== action.item)
        : [...state.roscChecklist, action.item],
    };
  }
  if (action.type === 'record-report') {
    if (state.status !== 'finished' || state.report !== null) return state;
    return { ...state, report: { number: action.number, recordId: action.recordId } };
  }
  // Fora de uma parada em curso nada mais se registra: a tela não oferece, e
  // um toque atrasado depois do RCE não pode mudar o relatório.
  if (state.status !== 'running') return state;

  switch (action.type) {
    case 'select-rhythm': {
      if (state.rhythm !== null) return state;
      return {
        ...state,
        rhythm: action.rhythm,
        cycleStartedAt: action.at,
        events: withEvent(state, action.at, 'rhythm', RHYTHM_CONTENT[action.rhythm].initialEvent),
      };
    }
    case 'complete-cycle': {
      if (state.cycleStartedAt === null || state.awaitingRhythmCheck) return state;
      const cycle = state.cycleCount + 1;
      return {
        ...state,
        cycleCount: cycle,
        cycleStartedAt: null,
        awaitingRhythmCheck: true,
        events: withEvent(state, action.at, 'cycle', EVENT_TEXT.cycleCompleted(cycle)),
      };
    }
    case 'check-rhythm': {
      if (!state.awaitingRhythmCheck) return state;
      const withEtco2: AclsState =
        action.etco2 === undefined
          ? state
          : {
              ...state,
              events: withEvent(
                state,
                action.at,
                'etco2',
                EVENT_TEXT.etco2(formatCompact(action.etco2, 1)),
              ),
            };
      if (action.result === 'rosc' || action.result === 'death') {
        return finish(withEtco2, action.at, action.result);
      }
      // O ANY registrava o ritmo duas vezes aqui ("Ritmo chocável" e, de novo
      // pelo SET_RHYTHM, "FV/TV sem pulso"), contra o próprio comentário do
      // código. Fica um registro por checagem (revisão clínica, item 3.1).
      return {
        ...withEtco2,
        rhythm: action.result,
        cycleStartedAt: action.at,
        awaitingRhythmCheck: false,
        events: withEvent(withEtco2, action.at, 'rhythm', RHYTHM_CONTENT[action.result].checkEvent),
      };
    }
    case 'register-shock': {
      const shock = state.shockCount + 1;
      return {
        ...state,
        shockCount: shock,
        events: withEvent(state, action.at, 'shock', EVENT_TEXT.shock(shock)),
      };
    }
    case 'register-medication': {
      const medication = aclsMedication(action.medication);
      return {
        ...state,
        medicationCounts: {
          ...state.medicationCounts,
          [action.medication]: (state.medicationCounts[action.medication] ?? 0) + 1,
        },
        lastEpinephrineAt: action.medication === 'epinefrina' ? action.at : state.lastEpinephrineAt,
        amiodarone300Given: state.amiodarone300Given || action.medication === 'amiodarona-300',
        amiodarone150Given: state.amiodarone150Given || action.medication === 'amiodarona-150',
        events: withEvent(state, action.at, 'med', medication.name),
      };
    }
    case 'set-advanced-airway':
      return {
        ...state,
        advancedAirway: action.value,
        events: action.value
          ? withEvent(state, action.at, 'system', EVENT_TEXT.advancedAirway)
          : state.events,
      };
    case 'set-epinephrine-interval':
      return { ...state, epinephrineIntervalSeconds: action.seconds };
    case 'toggle-compression-pause': {
      if (state.pauseStartedAt === null) {
        return {
          ...state,
          pauseStartedAt: action.at,
          events: withEvent(state, action.at, 'fct', EVENT_TEXT.compressionsPaused),
        };
      }
      const pauseMs = action.at - state.pauseStartedAt;
      return {
        ...state,
        pauseStartedAt: null,
        totalPauseMs: state.totalPauseMs + pauseMs,
        events: withEvent(
          state,
          action.at,
          'fct',
          EVENT_TEXT.compressionsResumed(Math.round(pauseMs / 1000)),
        ),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Seletores: tudo o que a tela mostra sai daqui, a partir do estado e de `now`.
// ---------------------------------------------------------------------------

/** Tempo total da parada em segundos; depois do fim, para no `endedAt`. */
export function aclsElapsedSeconds(state: AclsState, now: number): number {
  if (state.startedAt === null) return 0;
  return Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
}

/** "m:ss" do ANY (`formatElapsed`): 75 → "1:15", 3700 → "61:40". */
export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export type AclsCycleView =
  | { phase: 'waiting-rhythm' }
  | {
      phase: 'running';
      /** Número do ciclo em curso (1, 2, …). */
      number: number;
      remainingSeconds: number;
      /** Fração restante, de 1 a 0, para a barra. */
      remainingFraction: number;
      dueAt: number;
    }
  | { phase: 'awaiting-rhythm-check'; number: number }
  | { phase: 'over' };

export function selectCycle(state: AclsState, now: number): AclsCycleView {
  if (state.status !== 'running') return { phase: 'over' };
  if (state.awaitingRhythmCheck)
    return { phase: 'awaiting-rhythm-check', number: state.cycleCount };
  if (state.cycleStartedAt === null) return { phase: 'waiting-rhythm' };
  const elapsedMs = Math.max(0, now - state.cycleStartedAt);
  const remainingSeconds = Math.max(0, ACLS_CYCLE_SECONDS - Math.floor(elapsedMs / 1000));
  return {
    phase: 'running',
    number: state.cycleCount + 1,
    remainingSeconds,
    remainingFraction: remainingSeconds / ACLS_CYCLE_SECONDS,
    dueAt: state.cycleStartedAt + CYCLE_MS,
  };
}

/**
 * Quando o ciclo em curso vence, em ms. Quem roda o relógio despacha
 * `complete-cycle` com `at` = este valor (e não a hora em que percebeu), para
 * a linha do tempo marcar 2:00 mesmo se o navegador atrasou o timer.
 */
export function cycleDueAt(state: AclsState): number | null {
  if (state.status !== 'running' || state.cycleStartedAt === null || state.awaitingRhythmCheck) {
    return null;
  }
  return state.cycleStartedAt + CYCLE_MS;
}

export interface AclsEpinephrineTimer {
  elapsedSeconds: number;
  /** Negativo quando passou do intervalo. */
  remainingSeconds: number;
  due: boolean;
  /** Fração do intervalo já corrida, de 0 a 1. */
  progress: number;
  dueAt: number;
}

/** Barra "Próxima epinefrina em …" do ANY; `null` antes da 1ª dose. */
export function selectEpinephrineTimer(state: AclsState, now: number): AclsEpinephrineTimer | null {
  if (state.lastEpinephrineAt === null || state.status !== 'running') return null;
  const interval = state.epinephrineIntervalSeconds;
  const elapsedSeconds = Math.max(0, Math.floor((now - state.lastEpinephrineAt) / 1000));
  const remainingSeconds = interval - elapsedSeconds;
  return {
    elapsedSeconds,
    remainingSeconds,
    due: remainingSeconds <= 0,
    progress: Math.min(1, elapsedSeconds / interval),
    dueAt: state.lastEpinephrineAt + interval * 1000,
  };
}

/**
 * Fração de compressão torácica (%) ao vivo, como no ANY: tempo comprimindo
 * sobre o tempo total; pausa em curso conta como parada. `null` fora da parada
 * ou no primeiro segundo.
 */
export function selectCompressionFraction(state: AclsState, now: number): number | null {
  const total = aclsElapsedSeconds(state, now);
  if (state.status !== 'running' || total <= 0) return null;
  const ongoingPause = state.pauseStartedAt === null ? 0 : now - state.pauseStartedAt;
  const pausedSeconds = Math.round((state.totalPauseMs + ongoingPause) / 1000);
  return Math.max(0, Math.round(((total - pausedSeconds) / total) * 100));
}

export type AclsGuideId = 'cpr' | 'cpr-prepare-shock' | 'amiodarone-300' | 'amiodarone-150';

export interface AclsGuide {
  id: AclsGuideId;
  /** `alert` pede reavaliação da conduta (laranja); `action` é o passo em curso. */
  kind: 'action' | 'alert';
  text: string;
  detail: string | null;
}

/** Card "Agora" (`getGuide` do ANY). */
export function selectGuide(state: AclsState): AclsGuide {
  if (state.rhythm === null) {
    return { id: 'cpr', kind: 'action', text: GUIDE_TEXT.cpr, detail: null };
  }
  const epinephrine = GUIDE_TEXT.epinephrineEvery(state.epinephrineIntervalSeconds / 60);
  if (state.rhythm === 'shockable') {
    if (
      state.shockCount >= AMIODARONE_GUIDE_THRESHOLDS.firstDoseFromShock &&
      !state.amiodarone300Given
    ) {
      return {
        id: 'amiodarone-300',
        kind: 'alert',
        text: GUIDE_TEXT.amiodarone300,
        detail: GUIDE_TEXT.amiodarone300Detail,
      };
    }
    if (
      state.shockCount >= AMIODARONE_GUIDE_THRESHOLDS.secondDoseFromShock &&
      state.amiodarone300Given &&
      !state.amiodarone150Given
    ) {
      return {
        id: 'amiodarone-150',
        kind: 'alert',
        text: GUIDE_TEXT.amiodarone150,
        detail: GUIDE_TEXT.amiodarone150Detail,
      };
    }
    return {
      id: 'cpr-prepare-shock',
      kind: 'action',
      text: GUIDE_TEXT.cprPrepareShock,
      detail: epinephrine,
    };
  }
  return { id: 'cpr', kind: 'action', text: GUIDE_TEXT.cpr, detail: epinephrine };
}

export type AclsNudgeId = 'epinephrine' | 'iv-access' | 'advanced-airway' | 'reversible-causes';

export interface AclsNudge {
  id: AclsNudgeId;
  text: string;
  /** Epinefrina vencida: mais forte que um lembrete comum. */
  urgent: boolean;
}

/** Lembretes do ANY (`getNudges`), em ordem de prioridade e no máximo 2. */
export function selectNudges(state: AclsState, now: number): AclsNudge[] {
  const nudges: AclsNudge[] = [];
  const elapsed = aclsElapsedSeconds(state, now);

  if (state.lastEpinephrineAt === null) {
    const shockableAfterFirstCycle =
      state.rhythm === 'shockable' &&
      state.cycleCount >= NUDGE_THRESHOLDS.shockableFirstEpinephrineFromCycle;
    if (state.rhythm === 'nonshockable' || shockableAfterFirstCycle) {
      nudges.push({ id: 'epinephrine', text: NUDGE_TEXT.epinephrine, urgent: false });
    }
  } else if ((now - state.lastEpinephrineAt) / 1000 >= state.epinephrineIntervalSeconds) {
    nudges.push({ id: 'epinephrine', text: NUDGE_TEXT.epinephrine, urgent: true });
  }

  if (state.cycleCount === 0 && elapsed < NUDGE_THRESHOLDS.ivAccessUntilSeconds) {
    nudges.push({ id: 'iv-access', text: NUDGE_TEXT.ivAccess, urgent: false });
  }
  if (!state.advancedAirway && state.cycleCount >= NUDGE_THRESHOLDS.advancedAirwayFromCycle) {
    nudges.push({ id: 'advanced-airway', text: NUDGE_TEXT.advancedAirway, urgent: false });
  }
  if (state.cycleCount >= NUDGE_THRESHOLDS.reversibleCausesFromCycle) {
    nudges.push({ id: 'reversible-causes', text: NUDGE_TEXT.reversibleCauses, urgent: false });
  }
  return nudges.slice(0, MAX_VISIBLE_NUDGES);
}

// ---------------------------------------------------------------------------
// Restauração: a parada em curso é guardada no aparelho para sobreviver a um
// recarregamento da aba (o iOS descarta aba em segundo plano). O que vem do
// armazenamento não é confiável: só volta o que tem o formato certo.
// ---------------------------------------------------------------------------

const STATUSES: readonly AclsStatus[] = ['idle', 'running', 'finished'];
const OUTCOMES: readonly AclsOutcome[] = ['rosc', 'death'];
const EVENT_TYPES: readonly AclsEventType[] = [
  'system',
  'rhythm',
  'cycle',
  'med',
  'shock',
  'etco2',
  'fct',
  'outcome',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimeOrNull(value: unknown): value is number | null {
  return value === null || isTime(value);
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isEvent(value: unknown): value is AclsEvent {
  return (
    isRecord(value) &&
    isTime(value.at) &&
    isCount(value.elapsedSeconds) &&
    includes(EVENT_TYPES, value.type) &&
    typeof value.detail === 'string'
  );
}

function isReport(value: unknown): value is { number: number; recordId: string } {
  return (
    isRecord(value) &&
    isCount(value.number) &&
    typeof value.recordId === 'string' &&
    value.recordId !== ''
  );
}

/** Lê um estado salvo; devolve `null` se qualquer campo estiver fora do formato. */
export function parseAclsState(value: unknown): AclsState | null {
  if (!isRecord(value)) return null;
  const counts = value.medicationCounts;
  if (
    !includes(STATUSES, value.status) ||
    !isTimeOrNull(value.startedAt) ||
    !isTimeOrNull(value.endedAt) ||
    !(value.rhythm === null || includes(ACLS_RHYTHMS, value.rhythm)) ||
    !isCount(value.cycleCount) ||
    !isTimeOrNull(value.cycleStartedAt) ||
    typeof value.awaitingRhythmCheck !== 'boolean' ||
    !isCount(value.shockCount) ||
    !isTimeOrNull(value.lastEpinephrineAt) ||
    !(EPINEPHRINE_INTERVALS_SECONDS as readonly unknown[]).includes(
      value.epinephrineIntervalSeconds,
    ) ||
    !isRecord(counts) ||
    !Object.entries(counts).every(
      ([id, count]) => includes(ACLS_MEDICATION_IDS, id) && isCount(count),
    ) ||
    typeof value.amiodarone300Given !== 'boolean' ||
    typeof value.amiodarone150Given !== 'boolean' ||
    typeof value.advancedAirway !== 'boolean' ||
    !isTimeOrNull(value.pauseStartedAt) ||
    !isCount(value.totalPauseMs) ||
    !(value.outcome === null || includes(OUTCOMES, value.outcome)) ||
    !Array.isArray(value.events) ||
    !value.events.every(isEvent) ||
    !Array.isArray(value.roscChecklist) ||
    !value.roscChecklist.every((item) => includes(ROSC_CHECKLIST_IDS, item)) ||
    !(value.report === null || isReport(value.report))
  ) {
    return null;
  }
  return {
    status: value.status,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    rhythm: value.rhythm,
    cycleCount: value.cycleCount,
    cycleStartedAt: value.cycleStartedAt,
    awaitingRhythmCheck: value.awaitingRhythmCheck,
    shockCount: value.shockCount,
    lastEpinephrineAt: value.lastEpinephrineAt,
    epinephrineIntervalSeconds: value.epinephrineIntervalSeconds as EpinephrineIntervalSeconds,
    medicationCounts: counts as Partial<Record<AclsMedicationId, number>>,
    amiodarone300Given: value.amiodarone300Given,
    amiodarone150Given: value.amiodarone150Given,
    advancedAirway: value.advancedAirway,
    pauseStartedAt: value.pauseStartedAt,
    totalPauseMs: value.totalPauseMs,
    outcome: value.outcome,
    events: value.events,
    roscChecklist: value.roscChecklist as RoscChecklistItemId[],
    report: value.report,
  };
}
