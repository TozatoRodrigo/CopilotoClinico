import {
  CHOICE_SECTIONS,
  checklistOf,
  COMBATIVE_REGIMENS,
  isSedationCheckId,
  isSedationScreen,
  RED_FLAG_IDS,
  SEDATION_CHECK_IDS,
  SEDATION_CHECKLISTS,
  SEDATION_CHOICES,
  SEDATION_NEXT,
  URGENT_IM_DRUGS,
  type CombativeRegimen,
  type RedFlagId,
  type SedationCheckId,
  type SedationChecklistId,
  type SedationChoiceId,
  type SedationScreen,
  type UrgentImDrug,
} from './content';

/**
 * Estado do roteiro de sedação como reducer puro (CC-328): o caminho de
 * telas, as respostas e o que foi marcado. É o estado do SedaPath do ANY com
 * tipos fechados; o teste diferencial (tests/clinical-tools) roda os dois
 * lado a lado.
 *
 * O peso não mora aqui: é o peso adulto comum às ferramentas, e as contas o
 * recebem de fora (`deriveSedation`).
 *
 * Três diferenças deliberadas em relação ao ANY
 * (docs/ferramentas/revisao-clinica/sedacao.md):
 * - "Voltar" sempre volta para a tela anterior do caminho. No ANY, o "Voltar"
 *   do cetofol e o do pós-sedação abriam uma tela nova, então voltar duas
 *   vezes do preparo IV caía de novo no cetofol, e o pós-sedação de um
 *   combativo contido voltava para "Durante a sedação";
 * - "Sedação nas últimas 4 h" é uma resposta só. O ANY guardava a do pouco
 *   colaborativo e a do preparo IV em campos separados, que podiam discordar
 *   na tela; a dose do cetofol já usava a última resposta, e continua usando;
 * - as respostas valem até "Novo paciente", como no ANY: voltar não apaga a VO
 *   insuficiente nem a medicação escolhida (são fatos do paciente).
 */

export interface SedationState {
  /** Telas percorridas, da triagem até a atual (a última). */
  path: readonly SedationScreen[];
  /** "Recebeu sedação nas últimas 4 h?" — Não até o médico responder, como no ANY. */
  recentSedation: boolean;
  /** "Insuficiente" depois da sedação VO: reduz o cetofol e tira a pergunta das 4 h. */
  oralSedationFailed: boolean;
  /** Medicação IM no urgente sem acesso IV. */
  urgentImDrug: UrgentImDrug | null;
  /** Contenção química no combativo. */
  combativeRegimen: CombativeRegimen | null;
  /** Itens de checklist marcados. */
  checked: readonly SedationCheckId[];
  /** Red flags marcados no preparo IV (abrem o alerta de cada um). */
  redFlags: readonly RedFlagId[];
}

export type SedationAction =
  /** Cartão de opção da tela atual. */
  | { type: 'choose'; choice: SedationChoiceId }
  /** Botão de avançar da tela (ex.: "Calcular cetofol"). */
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'set-recent-sedation'; value: boolean }
  | { type: 'choose-urgent-im'; drug: UrgentImDrug }
  | { type: 'choose-combative-regimen'; regimen: CombativeRegimen }
  | { type: 'toggle-check'; id: SedationCheckId }
  | { type: 'toggle-red-flag'; id: RedFlagId }
  /** "Novo paciente": tudo do zero. */
  | { type: 'reset' };

export const INITIAL_SEDATION_STATE: SedationState = {
  path: ['triagem'],
  recentSedation: false,
  oralSedationFailed: false,
  urgentImDrug: null,
  combativeRegimen: null,
  checked: [],
  redFlags: [],
};

export function currentScreen(state: Pick<SedationState, 'path'>): SedationScreen {
  return state.path.at(-1) ?? 'triagem';
}

/** Cartões de opção da tela. No combativo, só depois de escolher a contenção química. */
export function availableChoices(state: SedationState): readonly SedationChoiceId[] {
  const screen = currentScreen(state);
  if (screen === 'combativo' && !state.combativeRegimen) return [];
  return CHOICE_SECTIONS[screen]?.choices ?? [];
}

/** Botão de avançar da tela, quando liberado (o IM urgente pede a medicação antes). */
export function nextStep(state: SedationState): { label: string; target: SedationScreen } | null {
  const screen = currentScreen(state);
  if (screen === 'im-urgente' && !state.urgentImDrug) return null;
  return SEDATION_NEXT[screen] ?? null;
}

/**
 * A pergunta da sedação nas últimas 4 h aparece no pouco colaborativo e no
 * preparo IV; no preparo, só se a VO não falhou (aí o ANY já avisa que houve
 * sedação).
 */
export function asksRecentSedation(state: SedationState): boolean {
  const screen = currentScreen(state);
  return screen === 'pouco-colaborativo' || (screen === 'preparo-iv' && !state.oralSedationFailed);
}

/** Cetofol pela metade: sedação nas últimas 4 h ou VO insuficiente (`sedPrevia` do ANY). */
export function isKetofolReduced(
  state: Pick<SedationState, 'recentSedation' | 'oralSedationFailed'>,
): boolean {
  return state.recentSedation || state.oralSedationFailed;
}

/** Checklists na tela atual; os do IM e do combativo só depois da medicação escolhida. */
export function visibleChecklists(state: SedationState): readonly SedationChecklistId[] {
  const screen = currentScreen(state);
  const all = (Object.keys(SEDATION_CHECKLISTS) as SedationChecklistId[]).filter(
    (checklist) => SEDATION_CHECKLISTS[checklist].screen === screen,
  );
  if (screen === 'im-urgente' && !state.urgentImDrug) return [];
  if (screen === 'combativo' && !state.combativeRegimen) return [];
  return all;
}

/** Liga ou desliga um id mantendo a ordem da definição (resumo e testes estáveis). */
function toggleIn<Id extends string>(
  list: readonly Id[],
  id: Id,
  order: readonly Id[],
): readonly Id[] {
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return order.filter((item) => next.includes(item));
}

function goTo(state: SedationState, screen: SedationScreen): SedationState {
  return { ...state, path: [...state.path, screen] };
}

export function sedationReducer(state: SedationState, action: SedationAction): SedationState {
  const screen = currentScreen(state);
  switch (action.type) {
    case 'choose': {
      if (!availableChoices(state).includes(action.choice)) return state;
      const choice = SEDATION_CHOICES[action.choice];
      return {
        ...goTo(state, choice.target),
        oralSedationFailed: state.oralSedationFailed || choice.marksOralSedationFailed === true,
      };
    }
    case 'advance': {
      const next = nextStep(state);
      return next ? goTo(state, next.target) : state;
    }
    case 'back':
      return state.path.length > 1 ? { ...state, path: state.path.slice(0, -1) } : state;
    case 'set-recent-sedation':
      return asksRecentSedation(state) ? { ...state, recentSedation: action.value } : state;
    case 'choose-urgent-im':
      return screen === 'im-urgente' ? { ...state, urgentImDrug: action.drug } : state;
    case 'choose-combative-regimen':
      return screen === 'combativo' ? { ...state, combativeRegimen: action.regimen } : state;
    case 'toggle-check':
      return visibleChecklists(state).includes(checklistOf(action.id))
        ? { ...state, checked: toggleIn(state.checked, action.id, SEDATION_CHECK_IDS) }
        : state;
    case 'toggle-red-flag':
      return screen === 'preparo-iv'
        ? { ...state, redFlags: toggleIn(state.redFlags, action.id, RED_FLAG_IDS) }
        : state;
    case 'reset':
      return INITIAL_SEDATION_STATE;
  }
}

/** Já há algo respondido além da tela inicial? */
export function hasSedationProgress(state: SedationState): boolean {
  return JSON.stringify(state) !== JSON.stringify(INITIAL_SEDATION_STATE);
}

// ---- Leitura do estado salvo na aba -----------------------------------------

/** Passos possíveis de uma tela para a outra: cartões de opção e botão de avançar. */
const TRANSITIONS = new Set<string>([
  ...(Object.keys(CHOICE_SECTIONS) as SedationScreen[]).flatMap((screen) =>
    (CHOICE_SECTIONS[screen]?.choices ?? []).map(
      (choice) => `${screen}>${SEDATION_CHOICES[choice].target}`,
    ),
  ),
  ...(Object.keys(SEDATION_NEXT) as SedationScreen[]).flatMap((screen) => {
    const next = SEDATION_NEXT[screen];
    return next ? [`${screen}>${next.target}`] : [];
  }),
]);

function isValidPath(path: readonly SedationScreen[]): boolean {
  if (path[0] !== 'triagem') return false;
  return path.every(
    (screen, index) => index === 0 || TRANSITIONS.has(`${path[index - 1]}>${screen}`),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

function idsOf<T extends string>(
  value: unknown,
  isId: (item: unknown) => item is T,
  order: readonly T[],
): readonly T[] | null {
  if (!Array.isArray(value) || !value.every(isId)) return null;
  return order.filter((id) => value.includes(id));
}

const MAX_PATH = 20;

/**
 * Lê o estado salvo na aba sem confiar no formato: campo ausente, caminho que
 * o roteiro não permite, de outra versão ou editado à mão devolve `null`, e o
 * roteiro começa do zero.
 */
export function parseSedationState(value: unknown): SedationState | null {
  if (!isRecord(value)) return null;
  const { path, recentSedation, oralSedationFailed, urgentImDrug, combativeRegimen } = value;
  if (
    !Array.isArray(path) ||
    path.length === 0 ||
    path.length > MAX_PATH ||
    !path.every(isSedationScreen) ||
    !isValidPath(path)
  ) {
    return null;
  }
  const checked = idsOf(value.checked, isSedationCheckId, SEDATION_CHECK_IDS);
  const redFlags = idsOf(
    value.redFlags,
    (item): item is RedFlagId => oneOf(RED_FLAG_IDS, item),
    RED_FLAG_IDS,
  );
  if (
    typeof recentSedation !== 'boolean' ||
    typeof oralSedationFailed !== 'boolean' ||
    !(urgentImDrug === null || oneOf(URGENT_IM_DRUGS, urgentImDrug)) ||
    !(combativeRegimen === null || oneOf(COMBATIVE_REGIMENS, combativeRegimen)) ||
    !checked ||
    !redFlags
  ) {
    return null;
  }
  // Caminho que passou do IM urgente ou do combativo sem a medicação não existe.
  const crossed = (screen: SedationScreen) => path.slice(0, -1).includes(screen);
  if ((crossed('im-urgente') && !urgentImDrug) || (crossed('combativo') && !combativeRegimen)) {
    return null;
  }
  return {
    path,
    recentSedation,
    oralSedationFailed,
    urgentImDrug,
    combativeRegimen,
    checked,
    redFlags,
  };
}
