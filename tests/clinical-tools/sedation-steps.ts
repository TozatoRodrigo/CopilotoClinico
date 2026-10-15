import {
  COMBATIVE,
  SEDATION_CHOICES,
  URGENT_IM,
  type CombativeRegimen,
  type SedationChoiceId,
  type UrgentImDrug,
} from '../../src/shared/clinical-tools/sedation/content';
import { regimenTitle, REGIMENS } from '../../src/shared/clinical-tools/sedation/doses';
import {
  INITIAL_SEDATION_STATE,
  sedationReducer,
  type SedationAction,
  type SedationState,
} from '../../src/shared/clinical-tools/sedation/state';
import { AnySedaPage } from './sedation-any-harness';
import { anyText, normalizeText } from './sedation-content-walk';

/**
 * Passos equivalentes nas duas telas (CC-328): cada um é a ação do porte e o
 * toque correspondente na página do ANY, achado pelo texto (o do ANY passa
 * pela mesma normalização do teste de paridade). Os testes montam caminhos
 * com eles e conferem as duas telas lado a lado.
 */

export interface Step {
  label: string;
  port: SedationAction;
  any: (page: AnySedaPage) => void;
}

/** Botão de avançar do ANY: o `Button` com seta (os links "Airway Guide →" são `<button>`). */
export function nextButton(page: AnySedaPage): string | null {
  return (
    page.buttonLabels('@Button').find((label) => label.endsWith('→') && !label.startsWith('←')) ??
    null
  );
}

export function choose(id: SedationChoiceId): Step {
  const title = SEDATION_CHOICES[id].title;
  return {
    label: `opção "${title}"`,
    port: { type: 'choose', choice: id },
    any: (page) => {
      const card = page
        .optionCards()
        .find((option) => anyText(option.title) === normalizeText(title));
      if (!card) throw new Error(`Opção "${title}" sem par na tela do ANY`);
      page.chooseOption(card.title);
    },
  };
}

export function answerRecentSedation(value: boolean): Step {
  return {
    label: `sedação nas últimas 4 h: ${value ? 'sim' : 'não'}`,
    port: { type: 'set-recent-sedation', value },
    any: (page) => page.setToggle(value ? 'sim' : 'nao'),
  };
}

function pickMedication(title: string): (page: AnySedaPage) => void {
  return (page) => {
    const option = page.medOptions().find((med) => anyText(med.title) === normalizeText(title));
    if (!option) throw new Error(`Medicação "${title}" sem par na tela do ANY`);
    page.chooseMed(option.title);
  };
}

export function urgentIm(drug: UrgentImDrug): Step {
  const option = URGENT_IM.options.find(({ id }) => id === drug);
  if (!option) throw new Error(drug);
  return {
    label: `IM urgente: ${drug}`,
    port: { type: 'choose-urgent-im', drug },
    any: pickMedication(regimenTitle(REGIMENS[option.regimen])),
  };
}

export function combative(regimen: CombativeRegimen): Step {
  const option = COMBATIVE.options.find(({ id }) => id === regimen);
  if (!option) throw new Error(regimen);
  return {
    label: `contenção química: ${regimen}`,
    port: { type: 'choose-combative-regimen', regimen },
    any: pickMedication(regimenTitle(REGIMENS[option.regimen])),
  };
}

export function advance(label: string): Step {
  return {
    label: `avançar (${label})`,
    port: { type: 'advance' },
    any: (page) => {
      const button = nextButton(page);
      if (!button || anyText(button) !== normalizeText(label)) {
        throw new Error(`Botão "${label}" sem par na tela do ANY`);
      }
      page.click(button);
    },
  };
}

export const BACK: Step = {
  label: 'voltar',
  port: { type: 'back' },
  any: (page) => page.click('← Voltar'),
};

/** Aplica os passos do zero nas duas telas. */
export function replay(steps: readonly Step[]): { page: AnySedaPage; state: SedationState } {
  const page = new AnySedaPage();
  let state = INITIAL_SEDATION_STATE;
  for (const step of steps) {
    step.any(page);
    state = sedationReducer(state, step.port);
  }
  return { page, state };
}
