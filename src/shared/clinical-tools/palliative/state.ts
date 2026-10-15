import { evaluateCalculator, type CalculatorEvaluation } from '../calculator';
import {
  MYTHS,
  PALLIATIVE_SCREENS,
  type PalliativeScreen,
  type SavedStep,
  type SymptomTab,
} from './content';
import type { HypodermoclysisTab } from './hypodermoclysis';
import { convertOpioid, type OpioidConversion, type OpioidId } from './opioids';
import {
  ECOG_LEVELS,
  PPI_CALCULATOR,
  PPS_LEVELS,
  type EcogGrade,
  type PpiItemId,
  type PpsPercent,
  type ScaleTab,
} from './scales';

/**
 * Estado do roteiro de cuidados paliativos como reducer puro (CC-329): tela,
 * abas, escalas marcadas, respostas do PPI, conversor de opioides, busca de
 * medicação subcutânea e o mito aberto. É o estado espalhado pelos
 * `useState` do PaliaPath do ANY, com tipos fechados.
 *
 * Diferença deliberada: no ANY cada tela perdia o estado ao sair (voltar para
 * o início zerava o PPI e a conversão). Aqui o estado vive enquanto a
 * ferramenta está aberta; apagar é gesto explícito ("Limpar").
 */

export type SavedLetter = SavedStep['letter'];

export interface OpioidState {
  from: OpioidId;
  to: OpioidId;
  /** Dose digitada, com vírgula ou ponto; validada na conta. */
  dose: string;
}

export interface PalliativeState {
  screen: PalliativeScreen;
  /** Passo do SAVED aberto; um por vez, como no ANY. */
  savedOpen: SavedLetter | null;
  symptomTab: SymptomTab;
  scaleTab: ScaleTab;
  hypodermoclysisTab: HypodermoclysisTab;
  ecog: EcogGrade | null;
  pps: PpsPercent | null;
  /** id do item do PPI → id da opção. */
  ppi: Readonly<Partial<Record<PpiItemId, string>>>;
  opioid: OpioidState;
  medicationQuery: string;
  /** Mito aberto (id), ou nenhum. */
  myth: number | null;
}

export type PalliativeAction =
  | { type: 'open-screen'; screen: PalliativeScreen }
  | { type: 'toggle-saved'; letter: SavedLetter }
  | { type: 'select-symptom-tab'; tab: SymptomTab }
  | { type: 'select-scale-tab'; tab: ScaleTab }
  | { type: 'select-hypodermoclysis-tab'; tab: HypodermoclysisTab }
  | { type: 'select-ecog'; grade: EcogGrade }
  | { type: 'select-pps'; percent: PpsPercent }
  | { type: 'answer-ppi'; item: PpiItemId; option: string }
  | { type: 'reset-ppi' }
  | { type: 'set-opioid-from'; opioid: OpioidId }
  | { type: 'set-opioid-to'; opioid: OpioidId }
  | { type: 'set-opioid-dose'; raw: string }
  | { type: 'reset-opioid' }
  | { type: 'search-medication'; query: string }
  | { type: 'open-myth'; id: number }
  | { type: 'close-myth' };

/** Conversor como o ANY abre: morfina VO para morfina VO, sem dose. */
export const INITIAL_OPIOID_STATE: OpioidState = { from: 'morfina-vo', to: 'morfina-vo', dose: '' };

export const INITIAL_PALLIATIVE_STATE: PalliativeState = {
  screen: 'inicio',
  savedOpen: null,
  symptomTab: 'dor',
  scaleTab: 'ecog',
  hypodermoclysisTab: 'indicacoes',
  ecog: null,
  pps: null,
  ppi: {},
  opioid: INITIAL_OPIOID_STATE,
  medicationQuery: '',
  myth: null,
};

function isPpiOption(item: PpiItemId, option: string): boolean {
  return Boolean(
    PPI_CALCULATOR.items.find(({ id }) => id === item)?.options.some(({ id }) => id === option),
  );
}

export function palliativeReducer(
  state: PalliativeState,
  action: PalliativeAction,
): PalliativeState {
  switch (action.type) {
    case 'open-screen':
      // O mito aberto é da tela de mitos: sair dela fecha.
      return { ...state, screen: action.screen, myth: null };
    case 'toggle-saved':
      return { ...state, savedOpen: state.savedOpen === action.letter ? null : action.letter };
    case 'select-symptom-tab':
      return { ...state, symptomTab: action.tab };
    case 'select-scale-tab':
      return { ...state, scaleTab: action.tab };
    case 'select-hypodermoclysis-tab':
      return { ...state, hypodermoclysisTab: action.tab };
    case 'select-ecog':
      return ECOG_LEVELS.some(({ grade }) => grade === action.grade)
        ? { ...state, ecog: action.grade }
        : state;
    case 'select-pps':
      return PPS_LEVELS.some(({ percent }) => percent === action.percent)
        ? { ...state, pps: action.percent }
        : state;
    case 'answer-ppi':
      return isPpiOption(action.item, action.option)
        ? { ...state, ppi: { ...state.ppi, [action.item]: action.option } }
        : state;
    case 'reset-ppi':
      return { ...state, ppi: {} };
    case 'set-opioid-from':
      return { ...state, opioid: { ...state.opioid, from: action.opioid } };
    case 'set-opioid-to':
      return { ...state, opioid: { ...state.opioid, to: action.opioid } };
    case 'set-opioid-dose':
      return { ...state, opioid: { ...state.opioid, dose: action.raw } };
    case 'reset-opioid':
      return { ...state, opioid: INITIAL_OPIOID_STATE };
    case 'search-medication':
      return { ...state, medicationQuery: action.query };
    case 'open-myth':
      return MYTHS.some(({ id }) => id === action.id) ? { ...state, myth: action.id } : state;
    case 'close-myth':
      return { ...state, myth: null };
  }
}

/** PPI ao vivo: pendente até os cinco itens terem resposta. */
export function ppiEvaluation(state: Pick<PalliativeState, 'ppi'>): CalculatorEvaluation {
  return evaluateCalculator(PPI_CALCULATOR, { items: state.ppi });
}

export function opioidConversion(state: Pick<PalliativeState, 'opioid'>): OpioidConversion {
  return convertOpioid(state.opioid);
}

function isPalliativeScreen(value: string): value is PalliativeScreen {
  return (PALLIATIVE_SCREENS as readonly string[]).includes(value);
}

/** Tela a partir do endereço (`#identificar`); `null` se não for uma tela do roteiro. */
export function parsePalliativeScreen(value: string): PalliativeScreen | null {
  const id = value.replace(/^#/, '');
  return isPalliativeScreen(id) ? id : null;
}
