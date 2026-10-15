import { describe, expect, it } from 'vitest';
import { classifyDengue } from './classification';
import {
  currentGroup,
  dengueReducer,
  groupOnScreen,
  hasDengueProgress,
  INITIAL_DENGUE_STATE,
  MAX_HISTORY,
  parseDengueState,
  RECLASSIFICATIONS,
  type DengueAction,
  type DengueState,
} from './state';

const T0 = Date.UTC(2026, 9, 15, 14, 0);

function run(actions: readonly DengueAction[], from: DengueState = INITIAL_DENGUE_STATE) {
  return actions.reduce(dengueReducer, from);
}

describe('classifyDengue', () => {
  it('segue a ordem gravidade → alarme → risco → A', () => {
    const none = { gravity: [], alarms: [], risks: [] } as const;
    expect(classifyDengue(none).group).toBe('A');
    expect(classifyDengue({ ...none, risks: ['gestante'] }).group).toBe('B');
    expect(classifyDengue({ ...none, risks: ['gestante'], alarms: ['vomitos'] }).group).toBe('C');
    expect(
      classifyDengue({ gravity: ['choque'], alarms: ['vomitos'], risks: ['gestante'] }),
    ).toMatchObject({ group: 'D', label: 'UTI / Emergência' });
  });
});

describe('dengueReducer — trilha', () => {
  it('abre o passo 4 com o grupo classificado ao vivo e registra a hora', () => {
    const state = run([
      { type: 'open-screen', screen: 'trilha-2' },
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'open-screen', screen: 'trilha-3' },
      { type: 'open-trail-group', at: T0 },
    ]);
    expect(state.screen).toBe('trilha-4');
    expect(state.trailGroup).toBe('C');
    expect(state.history).toEqual([{ group: 'C', origin: 'trilha', at: T0 }]);
  });

  it('"Ver manejo" fora do passo 3 não faz nada', () => {
    const state = run([{ type: 'open-trail-group', at: T0 }]);
    expect(state).toBe(INITIAL_DENGUE_STATE);
  });

  it('mantém a ordem da definição ao marcar e desmarcar', () => {
    const state = run([
      { type: 'toggle-alarm', id: 'letargia' },
      { type: 'toggle-alarm', id: 'dor-abdominal' },
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'toggle-alarm', id: 'letargia' },
    ]);
    expect(state.alarms).toEqual(['dor-abdominal', 'vomitos']);
  });

  it('"Reavaliar classificação" desmarca gravidade e risco, não o alarme', () => {
    const state = run([
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'toggle-gravity', id: 'choque' },
      { type: 'toggle-risk', id: 'gestante' },
      { type: 'reassess' },
    ]);
    expect(state).toMatchObject({ alarms: ['vomitos'], gravity: [], risks: [] });
  });

  it('navegar não apaga marcação (diferença deliberada do ANY)', () => {
    const state = run([
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'toggle-gravity', id: 'choque' },
      { type: 'open-screen', screen: 'trilha-1' },
      { type: 'open-screen', screen: 'trilha-3' },
    ]);
    expect(state).toMatchObject({ alarms: ['vomitos'], gravity: ['choque'] });
  });
});

describe('dengueReducer — reclassificação nos dois sentidos', () => {
  it('tira do conteúdo as transições do ANY', () => {
    expect(RECLASSIFICATIONS).toEqual({ A: ['B', 'C'], B: ['A', 'C'], C: ['B', 'D'], D: ['C'] });
  });

  it('sobe de A a D e desce de D a A, com histórico', () => {
    const state = run([
      { type: 'open-screen', screen: 'grupo-a' },
      { type: 'reclassify', to: 'B', at: T0 },
      { type: 'reclassify', to: 'C', at: T0 + 1 },
      { type: 'reclassify', to: 'D', at: T0 + 2 },
      { type: 'reclassify', to: 'C', at: T0 + 3 },
      { type: 'reclassify', to: 'B', at: T0 + 4 },
      { type: 'reclassify', to: 'A', at: T0 + 5 },
    ]);
    expect(state.screen).toBe('grupo-a');
    expect(state.history.map(({ group }) => group).join('')).toBe('BCDCBA');
    expect(currentGroup(state)).toEqual({ group: 'A', origin: 'reclassificacao', at: T0 + 5 });
  });

  it('ignora transição que o grupo não oferece e reclassificação fora do manejo', () => {
    const fromA = run([{ type: 'open-screen', screen: 'grupo-a' }]);
    expect(dengueReducer(fromA, { type: 'reclassify', to: 'D', at: T0 })).toBe(fromA);
    const fromHome = INITIAL_DENGUE_STATE;
    expect(dengueReducer(fromHome, { type: 'reclassify', to: 'B', at: T0 })).toBe(fromHome);
  });

  it('reclassifica também do passo 4 da trilha', () => {
    const state = run([
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'open-screen', screen: 'trilha-3' },
      { type: 'open-trail-group', at: T0 },
      { type: 'reclassify', to: 'D', at: T0 + 1 },
    ]);
    expect(groupOnScreen({ screen: 'trilha-4', trailGroup: 'C' })).toBe('C');
    expect(state.screen).toBe('grupo-d');
    expect(state.history.map(({ group }) => group)).toEqual(['C', 'D']);
  });

  it('guarda no máximo as últimas entradas do histórico', () => {
    let state = run([{ type: 'open-screen', screen: 'grupo-a' }]);
    for (let index = 0; index < MAX_HISTORY + 5; index += 1) {
      state = dengueReducer(state, {
        type: 'reclassify',
        to: state.screen === 'grupo-a' ? 'B' : 'A',
        at: T0 + index,
      });
    }
    expect(state.history).toHaveLength(MAX_HISTORY);
    expect(state.history.at(-1)?.at).toBe(T0 + MAX_HISTORY + 4);
  });
});

describe('dengueReducer — classificação direta', () => {
  it('abre os passos em ordem e leva ao grupo da resposta', () => {
    let state = run([{ type: 'open-screen', screen: 'classificacao' }]);
    expect(state.directStep).toBe(1);
    // Passo 3 ainda fechado: resposta ignorada.
    expect(dengueReducer(state, { type: 'answer-direct', step: 3, present: true, at: T0 })).toBe(
      state,
    );
    state = run(
      [
        { type: 'answer-direct', step: 1, present: false, at: T0 },
        { type: 'answer-direct', step: 2, present: false, at: T0 },
        { type: 'answer-direct', step: 3, present: true, at: T0 },
      ],
      state,
    );
    expect(state.screen).toBe('grupo-b');
    expect(state.history).toEqual([{ group: 'B', origin: 'direta', at: T0 }]);
  });

  it('reabrir a classificação direta recomeça pelo passo 1', () => {
    const state = run([
      { type: 'open-screen', screen: 'classificacao' },
      { type: 'answer-direct', step: 1, present: false, at: T0 },
      { type: 'open-screen', screen: 'inicio' },
      { type: 'open-screen', screen: 'classificacao' },
    ]);
    expect(state.directStep).toBe(1);
  });
});

describe('dengueReducer — tempo injetado e novo paciente', () => {
  it('é determinístico: as mesmas ações dão o mesmo estado', () => {
    const actions: DengueAction[] = [
      { type: 'open-screen', screen: 'alta' },
      { type: 'generate-patient-message', at: T0 },
      { type: 'open-screen', screen: 'grupo-c' },
      { type: 'reclassify', to: 'D', at: T0 + 60_000 },
    ];
    expect(run(actions)).toEqual(run(actions));
    expect(run(actions).patientMessage).toEqual({ issuedAt: T0 });
  });

  it('"Novo paciente" volta ao início', () => {
    const state = run([
      { type: 'toggle-risk', id: 'gestante' },
      { type: 'set-ht-baseline', raw: '45' },
    ]);
    expect(hasDengueProgress(state)).toBe(true);
    expect(dengueReducer(state, { type: 'reset' })).toBe(INITIAL_DENGUE_STATE);
    expect(hasDengueProgress(INITIAL_DENGUE_STATE)).toBe(false);
  });
});

describe('parseDengueState', () => {
  it('lê de volta o estado salvo', () => {
    const state = run([
      { type: 'toggle-alarm', id: 'vomitos' },
      { type: 'open-screen', screen: 'trilha-3' },
      { type: 'open-trail-group', at: T0 },
      { type: 'set-ht-current', raw: '52,5' },
      { type: 'generate-patient-message', at: T0 },
    ]);
    expect(parseDengueState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it.each([
    ['nada', null],
    ['tela desconhecida', { ...INITIAL_DENGUE_STATE, screen: 'outra' }],
    ['sinal desconhecido', { ...INITIAL_DENGUE_STATE, alarms: ['febre'] }],
    ['Ht longo demais', { ...INITIAL_DENGUE_STATE, htBaseline: 'x'.repeat(21) }],
    ['histórico inválido', { ...INITIAL_DENGUE_STATE, history: [{ group: 'E' }] }],
    ['mensagem sem horário', { ...INITIAL_DENGUE_STATE, patientMessage: { text: 'oi' } }],
  ])('descarta %s', (_name, value) => {
    expect(parseDengueState(value)).toBeNull();
  });
});
