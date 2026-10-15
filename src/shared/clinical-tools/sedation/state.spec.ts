import { describe, expect, it } from 'vitest';
import {
  asksRecentSedation,
  availableChoices,
  currentScreen,
  hasSedationProgress,
  INITIAL_SEDATION_STATE,
  isKetofolReduced,
  nextStep,
  parseSedationState,
  sedationReducer,
  visibleChecklists,
  type SedationAction,
  type SedationState,
} from './state';

function apply(...actions: SedationAction[]): SedationState {
  return actions.reduce(sedationReducer, INITIAL_SEDATION_STATE);
}

const toPreparation: SedationAction[] = [
  { type: 'choose', choice: 'pouco-colaborativo' },
  { type: 'choose', choice: 'urgente' },
  { type: 'choose', choice: 'com-acesso-iv' },
];

describe('sedationReducer', () => {
  it('começa na triagem, com as três opções de colaboração', () => {
    expect(currentScreen(INITIAL_SEDATION_STATE)).toBe('triagem');
    expect(availableChoices(INITIAL_SEDATION_STATE)).toEqual([
      'colaborativo',
      'pouco-colaborativo',
      'combativo',
    ]);
    expect(hasSedationProgress(INITIAL_SEDATION_STATE)).toBe(false);
  });

  it('escolha que não é da tela atual não faz nada', () => {
    expect(apply({ type: 'choose', choice: 'urgente' })).toBe(INITIAL_SEDATION_STATE);
  });

  it('guarda o caminho e volta pela tela anterior', () => {
    const state = apply(...toPreparation);
    expect(state.path).toEqual(['triagem', 'pouco-colaborativo', 'urgente', 'preparo-iv']);
    const back = sedationReducer(state, { type: 'back' });
    expect(currentScreen(back)).toBe('urgente');
    expect(sedationReducer(INITIAL_SEDATION_STATE, { type: 'back' })).toBe(INITIAL_SEDATION_STATE);
  });

  it('IM urgente só avança com a medicação escolhida', () => {
    const atIm = apply(
      { type: 'choose', choice: 'pouco-colaborativo' },
      { type: 'choose', choice: 'urgente' },
      { type: 'choose', choice: 'sem-acesso-iv' },
    );
    expect(nextStep(atIm)).toBeNull();
    expect(sedationReducer(atIm, { type: 'advance' })).toBe(atIm);
    const chosen = sedationReducer(atIm, { type: 'choose-urgent-im', drug: 'cetamina' });
    expect(nextStep(chosen)?.target).toBe('durante');
    expect(currentScreen(sedationReducer(chosen, { type: 'advance' }))).toBe('durante');
  });

  it('combativo só mostra as saídas depois da contenção química', () => {
    const atCombative = apply({ type: 'choose', choice: 'combativo' });
    expect(availableChoices(atCombative)).toEqual([]);
    expect(visibleChecklists(atCombative)).toEqual([]);
    const chosen = sedationReducer(atCombative, {
      type: 'choose-combative-regimen',
      regimen: 'midazolam-haloperidol-prometazina',
    });
    expect(availableChoices(chosen)).toEqual(['contencao-suficiente', 'sedacao-iv-adicional']);
    expect(visibleChecklists(chosen)).toEqual(['pos-contencao']);
  });

  it('a pergunta das 4 h vale no pouco colaborativo e no preparo IV, e é uma resposta só', () => {
    const low = apply({ type: 'choose', choice: 'pouco-colaborativo' });
    expect(asksRecentSedation(low)).toBe(true);
    const answered = sedationReducer(low, { type: 'set-recent-sedation', value: true });
    expect(isKetofolReduced(answered)).toBe(true);

    const atPreparation = [toPreparation[1], toPreparation[2]].reduce<SedationState>(
      (state, action) => (action ? sedationReducer(state, action) : state),
      answered,
    );
    expect(asksRecentSedation(atPreparation)).toBe(true);
    const changed = sedationReducer(atPreparation, { type: 'set-recent-sedation', value: false });
    expect(changed.recentSedation).toBe(false);
    expect(isKetofolReduced(changed)).toBe(false);
    // Fora dessas telas a pergunta não existe.
    expect(
      sedationReducer(INITIAL_SEDATION_STATE, { type: 'set-recent-sedation', value: true }),
    ).toBe(INITIAL_SEDATION_STATE);
  });

  it('VO insuficiente reduz o cetofol, tira a pergunta do preparo IV e vale até "Novo paciente"', () => {
    const state = apply(
      { type: 'choose', choice: 'colaborativo' },
      { type: 'choose', choice: 'precisa-sedacao' },
      { type: 'choose', choice: 'vo-insuficiente' },
    );
    expect(currentScreen(state)).toBe('preparo-iv');
    expect(state.oralSedationFailed).toBe(true);
    expect(isKetofolReduced(state)).toBe(true);
    expect(asksRecentSedation(state)).toBe(false);

    const backToTriage = [1, 2, 3].reduce<SedationState>(
      (current) => sedationReducer(current, { type: 'back' }),
      state,
    );
    expect(currentScreen(backToTriage)).toBe('triagem');
    expect(backToTriage.oralSedationFailed).toBe(true);
    expect(sedationReducer(backToTriage, { type: 'reset' })).toBe(INITIAL_SEDATION_STATE);
  });

  it('marca checklist só na tela dele, e red flag só no preparo IV', () => {
    const atPreparation = apply(...toPreparation);
    const checked = sedationReducer(atPreparation, { type: 'toggle-check', id: 'mat-asp' });
    expect(checked.checked).toEqual(['mat-asp']);
    expect(sedationReducer(checked, { type: 'toggle-check', id: 'mat-asp' }).checked).toEqual([]);
    expect(sedationReducer(atPreparation, { type: 'toggle-check', id: 'alta-sv' })).toBe(
      atPreparation,
    );

    const flagged = sedationReducer(atPreparation, { type: 'toggle-red-flag', id: 'jejum' });
    expect(flagged.redFlags).toEqual(['jejum']);
    expect(sedationReducer(INITIAL_SEDATION_STATE, { type: 'toggle-red-flag', id: 'jejum' })).toBe(
      INITIAL_SEDATION_STATE,
    );
  });

  it('mantém a ordem da definição nas marcações', () => {
    const atPreparation = apply(...toPreparation);
    const state = (['jejum', 'trauma'] as const).reduce<SedationState>(
      (current, id) => sedationReducer(current, { type: 'toggle-red-flag', id }),
      atPreparation,
    );
    expect(state.redFlags).toEqual(['trauma', 'jejum']);
  });
});

describe('parseSedationState', () => {
  const sample = sedationReducer(
    apply(
      { type: 'choose', choice: 'combativo' },
      { type: 'choose-combative-regimen', regimen: 'cetamina' },
      { type: 'toggle-check', id: 'nc-sv' },
      { type: 'choose', choice: 'sedacao-iv-adicional' },
    ),
    { type: 'toggle-red-flag', id: 'instabilidade' },
  );

  it('lê de volta o que foi salvo', () => {
    expect(parseSedationState(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });

  it('recusa caminho que o roteiro não permite', () => {
    expect(parseSedationState({ ...sample, path: ['triagem', 'cetofol'] })).toBeNull();
    expect(parseSedationState({ ...sample, path: ['colaborativo'] })).toBeNull();
    expect(parseSedationState({ ...sample, path: [] })).toBeNull();
  });

  it('recusa caminho que passou do combativo sem a contenção química', () => {
    expect(parseSedationState({ ...sample, combativeRegimen: null })).toBeNull();
  });

  it('recusa id, tipo ou formato desconhecido', () => {
    expect(parseSedationState({ ...sample, checked: ['inexistente'] })).toBeNull();
    expect(parseSedationState({ ...sample, redFlags: ['outro'] })).toBeNull();
    expect(parseSedationState({ ...sample, recentSedation: 'sim' })).toBeNull();
    expect(parseSedationState({ ...sample, urgentImDrug: 'propofol' })).toBeNull();
    expect(parseSedationState(null)).toBeNull();
    expect(parseSedationState('estado')).toBeNull();
  });
});
