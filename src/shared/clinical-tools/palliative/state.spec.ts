import { describe, expect, it } from 'vitest';
import { formatOpioidDose } from './opioids';
import {
  INITIAL_OPIOID_STATE,
  INITIAL_PALLIATIVE_STATE,
  opioidConversion,
  palliativeReducer,
  parsePalliativeScreen,
  ppiEvaluation,
  type PalliativeAction,
  type PalliativeState,
} from './state';

function run(...actions: PalliativeAction[]): PalliativeState {
  return actions.reduce(palliativeReducer, INITIAL_PALLIATIVE_STATE);
}

describe('palliativeReducer', () => {
  it('abre como o ANY: início, aba de dor, ECOG, indicações e morfina VO → morfina VO', () => {
    expect(INITIAL_PALLIATIVE_STATE).toMatchObject({
      screen: 'inicio',
      symptomTab: 'dor',
      scaleTab: 'ecog',
      hypodermoclysisTab: 'indicacoes',
      opioid: { from: 'morfina-vo', to: 'morfina-vo', dose: '' },
    });
  });

  it('navega entre telas e abas sem perder o que já foi feito', () => {
    const state = run(
      { type: 'open-screen', screen: 'ferramentas' },
      { type: 'select-scale-tab', tab: 'opioides' },
      { type: 'set-opioid-from', opioid: 'tramadol' },
      { type: 'set-opioid-dose', raw: '300' },
      { type: 'open-screen', screen: 'manejar' },
      { type: 'select-symptom-tab', tab: 'delirium' },
      { type: 'open-screen', screen: 'ferramentas' },
    );
    expect(state).toMatchObject({
      screen: 'ferramentas',
      scaleTab: 'opioides',
      symptomTab: 'delirium',
      opioid: { from: 'tramadol', to: 'morfina-vo', dose: '300' },
    });
    const conversion = opioidConversion(state);
    expect(conversion.status === 'complete' && formatOpioidDose(conversion.value)).toBe('22,5');
  });

  it('abre um passo do SAVED por vez e fecha ao tocar de novo', () => {
    expect(run({ type: 'toggle-saved', letter: 'A' }).savedOpen).toBe('A');
    expect(
      run({ type: 'toggle-saved', letter: 'A' }, { type: 'toggle-saved', letter: 'D' }).savedOpen,
    ).toBe('D');
    expect(
      run({ type: 'toggle-saved', letter: 'A' }, { type: 'toggle-saved', letter: 'A' }).savedOpen,
    ).toBeNull();
  });

  it('marca ECOG e PPS e ignora valor fora da escala', () => {
    const state = run({ type: 'select-ecog', grade: 3 }, { type: 'select-pps', percent: 40 });
    expect(state).toMatchObject({ ecog: 3, pps: 40 });
    const invalid = { type: 'select-pps', percent: 45 } as unknown as PalliativeAction;
    expect(palliativeReducer(state, invalid)).toBe(state);
  });

  it('responde o PPI só com opção do item e limpa', () => {
    const state = run(
      { type: 'answer-ppi', item: 'pps', option: '10-20' },
      { type: 'answer-ppi', item: 'oral', option: 'presente' },
    );
    expect(state.ppi).toEqual({ pps: '10-20' });
    expect(ppiEvaluation(state).status).toBe('pending');
    expect(palliativeReducer(state, { type: 'reset-ppi' }).ppi).toEqual({});
  });

  it('calcula o PPI quando os cinco itens têm resposta', () => {
    const state = run(
      { type: 'answer-ppi', item: 'pps', option: '10-20' },
      { type: 'answer-ppi', item: 'oral', option: 'normal' },
      { type: 'answer-ppi', item: 'edema', option: 'ausente' },
      { type: 'answer-ppi', item: 'dispneia', option: 'presente' },
      { type: 'answer-ppi', item: 'delirium', option: 'ausente' },
    );
    expect(ppiEvaluation(state)).toMatchObject({ status: 'complete', value: 7.5 });
  });

  it('"Limpar" do conversor volta ao estado inicial dele', () => {
    const state = run(
      { type: 'set-opioid-from', opioid: 'codeina' },
      { type: 'set-opioid-to', opioid: 'fentanil-ev' },
      { type: 'set-opioid-dose', raw: '120' },
      { type: 'reset-opioid' },
    );
    expect(state.opioid).toEqual(INITIAL_OPIOID_STATE);
  });

  it('abre e fecha mito; mito inexistente não abre; sair da tela fecha', () => {
    expect(run({ type: 'open-myth', id: 22 }).myth).toBe(22);
    expect(run({ type: 'open-myth', id: 99 }).myth).toBeNull();
    expect(run({ type: 'open-myth', id: 7 }, { type: 'close-myth' }).myth).toBeNull();
    expect(
      run({ type: 'open-myth', id: 7 }, { type: 'open-screen', screen: 'inicio' }).myth,
    ).toBeNull();
  });

  it('guarda a busca de medicação como digitada', () => {
    expect(run({ type: 'search-medication', query: 'Morf' }).medicationQuery).toBe('Morf');
  });
});

describe('parsePalliativeScreen', () => {
  it('lê a tela do endereço, com ou sem #', () => {
    expect(parsePalliativeScreen('#decidir')).toBe('decidir');
    expect(parsePalliativeScreen('mitos')).toBe('mitos');
    expect(parsePalliativeScreen('#nada')).toBeNull();
    expect(parsePalliativeScreen('')).toBeNull();
  });
});
