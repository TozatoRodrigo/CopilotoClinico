import { classifyDengue } from './classification';
import {
  ALARM_SIGN_IDS,
  DENGUE_GROUPS,
  DENGUE_SCREENS,
  DIRECT_CLASSIFICATION,
  GRAVITY_SIGN_IDS,
  GROUP_PAGES,
  GROUP_SCREEN,
  RISK_CONDITION_IDS,
  type AlarmSignId,
  type DengueBlock,
  type DengueGroup,
  type DengueScreen,
  type DirectQuestion,
  type GravitySignId,
  type RiskConditionId,
} from './content';

/**
 * Estado do roteiro de dengue como reducer puro (CC-325): tela, sinais
 * marcados, passo da classificação direta, grupo da trilha, Ht digitado,
 * mensagem de alta e o histórico de classificações. É o estado do
 * `DenguePath` do ANY com tipos fechados; o teste diferencial
 * (tests/clinical-tools/dengue-differential.spec.ts) roda os dois lado a lado.
 *
 * O tempo entra pela ação (`at`, em ms): o reducer nunca lê o relógio, então
 * o mesmo histórico de ações dá sempre o mesmo estado. O peso não mora aqui: é
 * o peso adulto comum às ferramentas, e as contas o recebem de fora.
 *
 * Duas diferenças deliberadas em relação ao ANY (docs/ferramentas/revisao-clinica/dengue.md):
 * - a classificação é ao vivo (ADR-017, sem botão "Classificar"), então não
 *   há resultado guardado que possa ficar desatualizado;
 * - navegar não apaga marcação. No ANY, voltar ao passo 1 apagava os sinais
 *   de alarme e voltar ao passo 3 apagava gravidade e risco; com o resultado
 *   ao vivo isso trocaria o grupo sem o médico pedir. Apagar é sempre um
 *   gesto explícito: "Reavaliar classificação" ou "Novo paciente".
 */

export type DirectStep = 1 | 2 | 3;

export type GroupOrigin = 'trilha' | 'direta' | 'reclassificacao';

/** Um grupo atribuído ao paciente: pela trilha, pela classificação direta ou por reclassificação. */
export interface GroupEntry {
  group: DengueGroup;
  origin: GroupOrigin;
  /** Quando (ms desde a época), vindo da ação. */
  at: number;
}

export interface DengueState {
  screen: DengueScreen;
  /** Grupo do passo 4 da trilha (`trilhaGrupo` do ANY). */
  trailGroup: DengueGroup | null;
  alarms: readonly AlarmSignId[];
  gravity: readonly GravitySignId[];
  risks: readonly RiskConditionId[];
  /** Até que passo a classificação direta está aberta (`classStep2Visible`/`classStep3Visible`). */
  directStep: DirectStep;
  /** Ht digitado (vírgula ou ponto); validado nas contas. */
  htBaseline: string;
  htCurrent: string;
  /** Mensagem de alta gerada. Guarda só o horário: o texto sai do motor, sem dado do paciente. */
  patientMessage: { issuedAt: number } | null;
  /** Classificações e reclassificações, em ordem; o último é o grupo atual. */
  history: readonly GroupEntry[];
}

export type DengueAction =
  | { type: 'open-screen'; screen: DengueScreen }
  | { type: 'toggle-alarm'; id: AlarmSignId }
  | { type: 'toggle-gravity'; id: GravitySignId }
  | { type: 'toggle-risk'; id: RiskConditionId }
  /** "Reavaliar classificação": desmarca gravidade e risco (o alarme é do passo 2). */
  | { type: 'reassess' }
  /** "Ver manejo do Grupo X" no passo 3: abre o passo 4 com o grupo classificado agora. */
  | { type: 'open-trail-group'; at: number }
  /** Resposta a um passo da classificação direta. */
  | { type: 'answer-direct'; step: DirectStep; present: boolean; at: number }
  /** Botão de reclassificação do manejo do grupo atual. */
  | { type: 'reclassify'; to: DengueGroup; at: number }
  | { type: 'set-ht-baseline'; raw: string }
  | { type: 'set-ht-current'; raw: string }
  | { type: 'generate-patient-message'; at: number }
  /** "Novo paciente": tudo do zero. */
  | { type: 'reset' };

export const INITIAL_DENGUE_STATE: DengueState = {
  screen: 'inicio',
  trailGroup: null,
  alarms: [],
  gravity: [],
  risks: [],
  directStep: 1,
  htBaseline: '',
  htCurrent: '',
  patientMessage: null,
  history: [],
};

/** Histórico guardado na aba; mais que isso é ruído e só engorda o armazenamento. */
export const MAX_HISTORY = 20;

/** Liga ou desliga um id mantendo a ordem da definição (resumo e testes estáveis). */
function toggleIn<Id extends string>(
  list: readonly Id[],
  id: Id,
  order: readonly Id[],
): readonly Id[] {
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return order.filter((item) => next.includes(item));
}

function reclassifyTargets(blocks: readonly DengueBlock[] | undefined): DengueGroup[] {
  return (blocks ?? []).flatMap((block) => (block.kind === 'reclassify' ? [block.to] : []));
}

function reclassificationsOf(group: DengueGroup): readonly DengueGroup[] {
  const page = GROUP_PAGES[group];
  const targets = [
    ...reclassifyTargets(page.intro),
    ...page.sections.flatMap((section) => reclassifyTargets(section.blocks)),
    ...reclassifyTargets(page.outro),
  ];
  return DENGUE_GROUPS.filter((target) => targets.includes(target));
}

/**
 * Reclassificações que o manejo de cada grupo oferece, tiradas do conteúdo
 * (os botões do ANY): A → B, C; B → A, C; C → D, B; D → C. Só estas valem.
 */
export const RECLASSIFICATIONS: Record<DengueGroup, readonly DengueGroup[]> = {
  A: reclassificationsOf('A'),
  B: reclassificationsOf('B'),
  C: reclassificationsOf('C'),
  D: reclassificationsOf('D'),
};

const GROUP_OF_SCREEN = new Map<DengueScreen, DengueGroup>(
  DENGUE_GROUPS.map((group) => [GROUP_SCREEN[group], group]),
);

/**
 * Grupo cujo manejo está na tela: o da página do grupo ou o do passo 4 da
 * trilha. Fora delas, `null` (não há o que reclassificar).
 */
export function groupOnScreen(
  state: Pick<DengueState, 'screen' | 'trailGroup'>,
): DengueGroup | null {
  if (state.screen === 'trilha-4') return state.trailGroup ?? 'A';
  return GROUP_OF_SCREEN.get(state.screen) ?? null;
}

/** Grupo atual do paciente: o último classificado ou reclassificado. */
export function currentGroup(state: Pick<DengueState, 'history'>): GroupEntry | null {
  return state.history.at(-1) ?? null;
}

function record(state: DengueState, entry: GroupEntry): readonly GroupEntry[] {
  return [...state.history, entry].slice(-MAX_HISTORY);
}

function openScreen(state: DengueState, screen: DengueScreen): DengueState {
  // Como no ANY, abrir a classificação direta recomeça o fluxo pelo passo 1.
  return screen === 'classificacao' ? { ...state, screen, directStep: 1 } : { ...state, screen };
}

function answerDirect(
  state: DengueState,
  step: DirectStep,
  present: boolean,
  at: number,
): DengueState {
  if (state.screen !== 'classificacao' || step > state.directStep) return state;
  const question: DirectQuestion | undefined = DIRECT_CLASSIFICATION.questions[step - 1];
  if (!question) return state;
  const group: DengueGroup | undefined = present ? question.yes.group : question.no.group;
  if (group) {
    return {
      ...state,
      screen: GROUP_SCREEN[group],
      history: record(state, { group, origin: 'direta', at }),
    };
  }
  // "Não → Próximo": abre o passo seguinte, sem fechar o atual.
  const next = (step + 1) as DirectStep;
  return next > state.directStep ? { ...state, directStep: next } : state;
}

export function dengueReducer(state: DengueState, action: DengueAction): DengueState {
  switch (action.type) {
    case 'open-screen':
      return openScreen(state, action.screen);
    case 'toggle-alarm':
      return { ...state, alarms: toggleIn(state.alarms, action.id, ALARM_SIGN_IDS) };
    case 'toggle-gravity':
      return { ...state, gravity: toggleIn(state.gravity, action.id, GRAVITY_SIGN_IDS) };
    case 'toggle-risk':
      return { ...state, risks: toggleIn(state.risks, action.id, RISK_CONDITION_IDS) };
    case 'reassess':
      return { ...state, gravity: [], risks: [] };
    case 'open-trail-group': {
      if (state.screen !== 'trilha-3') return state;
      const { group } = classifyDengue(state);
      return {
        ...state,
        screen: 'trilha-4',
        trailGroup: group,
        history: record(state, { group, origin: 'trilha', at: action.at }),
      };
    }
    case 'answer-direct':
      return answerDirect(state, action.step, action.present, action.at);
    case 'reclassify': {
      const from = groupOnScreen(state);
      if (!from || !RECLASSIFICATIONS[from].includes(action.to)) return state;
      return {
        ...state,
        screen: GROUP_SCREEN[action.to],
        history: record(state, { group: action.to, origin: 'reclassificacao', at: action.at }),
      };
    }
    case 'set-ht-baseline':
      return { ...state, htBaseline: action.raw };
    case 'set-ht-current':
      return { ...state, htCurrent: action.raw };
    case 'generate-patient-message':
      return { ...state, patientMessage: { issuedAt: action.at } };
    case 'reset':
      return INITIAL_DENGUE_STATE;
  }
}

/** Há algo do paciente atual: sinal marcado, grupo atribuído, Ht ou mensagem. */
export function hasDengueProgress(state: DengueState): boolean {
  return (
    state.alarms.length > 0 ||
    state.gravity.length > 0 ||
    state.risks.length > 0 ||
    state.history.length > 0 ||
    state.htBaseline.trim() !== '' ||
    state.htCurrent.trim() !== '' ||
    state.patientMessage !== null
  );
}

// ---------------------------------------------------------------------------
// Leitura do estado salvo na aba
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string | number>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

function idList<Id extends string>(value: unknown, order: readonly Id[]): readonly Id[] | null {
  if (!Array.isArray(value) || !value.every((item) => oneOf(item, order))) return null;
  return order.filter((id) => (value as unknown[]).includes(id));
}

function shortText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 20;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

const ORIGINS: readonly GroupOrigin[] = ['trilha', 'direta', 'reclassificacao'];

function parseHistory(value: unknown): readonly GroupEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_HISTORY) return null;
  const entries: GroupEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { group, origin, at } = item;
    if (!oneOf(group, DENGUE_GROUPS) || !oneOf(origin, ORIGINS) || !isTime(at)) return null;
    entries.push({ group, origin, at });
  }
  return entries;
}

/**
 * Lê o estado salvo sem confiar no formato: de outra versão, editado à mão ou
 * corrompido vira `null`, e a tela começa do zero.
 */
export function parseDengueState(value: unknown): DengueState | null {
  if (!isRecord(value)) return null;
  const alarms = idList(value.alarms, ALARM_SIGN_IDS);
  const gravity = idList(value.gravity, GRAVITY_SIGN_IDS);
  const risks = idList(value.risks, RISK_CONDITION_IDS);
  const history = parseHistory(value.history);
  const { screen, trailGroup, directStep, htBaseline, htCurrent, patientMessage } = value;
  if (
    !oneOf(screen, DENGUE_SCREENS) ||
    !(trailGroup === null || oneOf(trailGroup, DENGUE_GROUPS)) ||
    !oneOf(directStep, [1, 2, 3] as const) ||
    !shortText(htBaseline) ||
    !shortText(htCurrent) ||
    !(patientMessage === null || (isRecord(patientMessage) && isTime(patientMessage.issuedAt))) ||
    !alarms ||
    !gravity ||
    !risks ||
    !history
  ) {
    return null;
  }
  return {
    screen,
    trailGroup,
    alarms,
    gravity,
    risks,
    directStep,
    htBaseline,
    htCurrent,
    patientMessage:
      patientMessage === null ? null : { issuedAt: patientMessage.issuedAt as number },
    history,
  };
}
