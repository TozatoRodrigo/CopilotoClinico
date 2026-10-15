import { describe, expect, it } from 'vitest';
import {
  cadEhhReducer,
  INITIAL_CAD_EHH_STATE,
  isPristineCadEhhState,
  panelGuidance,
  parseCadEhhState,
  readCycle,
  readKcl,
  readPanel,
  type CadEhhAction,
  type CadEhhState,
} from './roteiro';

function run(actions: readonly CadEhhAction[], from: CadEhhState = INITIAL_CAD_EHH_STATE) {
  return actions.reduce(cadEhhReducer, from);
}

const T0 = Date.UTC(2026, 9, 15, 3, 0);
const MINUTE = 60_000;

describe('painel de exames', () => {
  it('lê só o que está dentro da faixa do ANY; fora dela vira erro, não número', () => {
    const state = run([
      { type: 'digitar-exame', field: 'glicemia', raw: '540' },
      { type: 'digitar-exame', field: 'potassio', raw: '12' },
      { type: 'digitar-exame', field: 'phVenoso', raw: '7,1' },
      { type: 'digitar-exame', field: 'sodio', raw: '1.500' },
    ]);
    const { values, errors } = readPanel(state.panel);
    expect(values).toMatchObject({ glicemia: 540, potassio: null, phVenoso: 7.1, sodio: null });
    expect(errors.potassio?.kind).toBe('out-of-range');
    expect(errors.sodio?.kind).toBe('ambiguous-separator');
    expect(errors.cloro).toBeUndefined();
  });

  it('sem potássio (vazio ou inválido), a insulina continua travada', () => {
    for (const raw of ['', '12', 'abc']) {
      const state = run([{ type: 'digitar-exame', field: 'potassio', raw }]);
      const guidance = panelGuidance(state, readPanel(state.panel).values, 70);
      expect(guidance.insulinGate).toBe('sem-potassio');
    }
  });

  it('deriva fase B, gravidade, potássio e insulina do painel e do peso', () => {
    const state = run([
      { type: 'digitar-exame', field: 'glicemia', raw: '600' },
      { type: 'digitar-exame', field: 'sodio', raw: '130' },
      { type: 'digitar-exame', field: 'potassio', raw: '3,2' },
      { type: 'digitar-exame', field: 'cloro', raw: '95' },
      { type: 'digitar-exame', field: 'bicarbonato', raw: '8' },
      { type: 'digitar-exame', field: 'phVenoso', raw: '7,05' },
      { type: 'consciencia', value: 'sonolento' },
    ]);
    const guidance = panelGuidance(state, readPanel(state.panel).values, 70);
    expect(guidance).toMatchObject({
      correctedNa: 140,
      maintenance: 'atOrAbove135',
      anionGap: 27,
      effectiveOsmolality: 293,
      severity: 'grave',
      potassiumBand: 'baixo',
      insulinGate: 'bloqueada',
      insulinRate: 7,
      // Trilha CAD: déficit de água e de volume são só do EHH e do misto.
      freeWaterDeficit: null,
      hhsVolumeDeficit: null,
    });
  });

  it('na trilha EHH calcula o déficit de água e de volume', () => {
    const state = run([
      { type: 'trilha', track: 'ehh' },
      { type: 'sexo', sex: 'F' },
      { type: 'idoso' },
      { type: 'digitar-exame', field: 'glicemia', raw: '1100' },
      { type: 'digitar-exame', field: 'sodio', raw: '148' },
    ]);
    const guidance = panelGuidance(state, readPanel(state.panel).values, 60);
    expect(guidance.correctedNa).toBe(168);
    expect(guidance.freeWaterDeficit).toBe(5.4);
    expect(guidance.hhsVolumeDeficit).toEqual({ min: 6, max: 13.2 });
  });
});

describe('escolhas', () => {
  it('tocar de novo na cetonúria, na consciência ou no estado volêmico desmarca', () => {
    const marked = run([
      { type: 'cetonuria', value: '2+' },
      { type: 'consciencia', value: 'alerta' },
      { type: 'estado-volemico', id: 'leve' },
    ]);
    expect(marked).toMatchObject({
      ketonuria: '2+',
      consciousness: 'alerta',
      volemicState: 'leve',
    });
    const cleared = run(
      [
        { type: 'cetonuria', value: '2+' },
        { type: 'consciencia', value: 'alerta' },
        { type: 'estado-volemico', id: 'leve' },
      ],
      marked,
    );
    expect(cleared).toMatchObject({ ketonuria: null, consciousness: null, volemicState: null });
  });

  it('marca e desmarca precipitante sem repetir', () => {
    const state = run([
      { type: 'precipitante', id: 'isglt2' },
      { type: 'precipitante', id: 'infeccao' },
      { type: 'precipitante', id: 'isglt2' },
    ]);
    expect(state.precipitants).toEqual(['infeccao']);
  });

  it('recomeçar volta ao estado inicial', () => {
    const state = run([{ type: 'trilha', track: 'misto' }, { type: 'recomecar' }]);
    expect(state).toEqual(INITIAL_CAD_EHH_STATE);
    expect(isPristineCadEhhState(state)).toBe(true);
  });

  it('trocar de tela não conta como dado digitado', () => {
    const state = run([{ type: 'ir-para', screen: 'e3' }]);
    expect(isPristineCadEhhState(state)).toBe(true);
    expect(isPristineCadEhhState(run([{ type: 'idoso' }]))).toBe(false);
  });
});

describe('calculadora de KCl', () => {
  it('mL e mEq se espelham pela apresentação', () => {
    const byMl = run([{ type: 'kcl-ml', raw: '15' }]);
    expect(byMl.kcl).toMatchObject({ mlRaw: '15', mEqRaw: '20,1' });
    const byMEq = run([{ type: 'kcl-meq', raw: '20' }]);
    expect(byMEq.kcl).toMatchObject({ mEqRaw: '20', mlRaw: '14,9' });
  });

  it('trocar a apresentação mantém o mL e refaz o mEq', () => {
    const state = run([
      { type: 'kcl-ml', raw: '10' },
      { type: 'kcl-apresentacao', id: '19.1' },
    ]);
    expect(state.kcl).toMatchObject({ presentation: '19.1', mlRaw: '10', mEqRaw: '25,6' });
  });

  it('sem volume final usa o mínimo da via e calcula diluente e velocidade', () => {
    const state = run([{ type: 'kcl-meq', raw: '20' }]);
    const reading = readKcl(state.kcl);
    expect(reading.result).toMatchObject({
      dose: 20,
      rate: 10,
      finalVolumeMl: 400,
      diluentMl: 385.1,
      hours: 2,
      preparation: { kclVolumeMl: 14.9, rateMlPerHour: 200, exceedsLimit: false },
    });
    expect(reading.osmoticAlert).toBe(false);
  });

  it('volume final digitado e inválido não cai calado no mínimo', () => {
    const state = run([
      { type: 'kcl-meq', raw: '20' },
      { type: 'kcl-volume', raw: '10' },
    ]);
    const reading = readKcl(state.kcl);
    expect(reading.result).toBeNull();
    expect(reading.errors.volume?.kind).toBe('out-of-range');
  });

  it('acima de 20 mEq/h, alerta de efeito osmótico; sem velocidade, sem tempo', () => {
    expect(readKcl(run([{ type: 'kcl-velocidade', raw: '25' }]).kcl).osmoticAlert).toBe(true);
    const noRate = readKcl(
      run([
        { type: 'kcl-meq', raw: '20' },
        { type: 'kcl-velocidade', raw: '' },
      ]).kcl,
    );
    expect(noRate.result).toMatchObject({ rate: null, hours: null });
  });
});

describe('ciclo de reavaliação (tempo injetado)', () => {
  const firstRound = run([
    { type: 'digitar-rodada', field: 'glicemia', raw: '450' },
    { type: 'digitar-rodada', field: 'potassio', raw: '4,2' },
    { type: 'nova-rodada', at: T0 },
  ]);

  it('fechar a rodada guarda os valores e a hora, e abre a próxima vazia', () => {
    expect(firstRound.cycle.round).toBe(2);
    expect(firstRound.cycle.previous).toEqual({
      at: T0,
      values: {
        glicemia: 450,
        potassio: 4.2,
        sodio: null,
        cloro: null,
        phVenoso: null,
        bicarbonato: null,
      },
    });
    expect(firstRound.cycle.current.glicemia).toBe('');
  });

  it('a queda por hora usa o relógio recebido, não o da máquina', () => {
    const state = run([{ type: 'digitar-rodada', field: 'glicemia', raw: '400' }], firstRound);
    const reading = readCycle(state, 70, T0 + 60 * MINUTE);
    expect(reading.minutes).toBe(60);
    expect(reading.fall).toMatchObject({ perHour: 50, reading: 'adequada', extrapolable: true });
    expect(readCycle(state, 70, T0 + 10 * MINUTE).fall).toMatchObject({ extrapolable: false });
  });

  it('glicemia abaixo de 250 sugere 0,05 U/kg/h; resolução e delta/delta saem da rodada', () => {
    const state = run(
      [
        { type: 'digitar-rodada', field: 'glicemia', raw: '220' },
        { type: 'digitar-rodada', field: 'sodio', raw: '138' },
        { type: 'digitar-rodada', field: 'cloro', raw: '112' },
        { type: 'digitar-rodada', field: 'bicarbonato', raw: '16' },
        { type: 'digitar-rodada', field: 'phVenoso', raw: '7,31' },
      ],
      firstRound,
    );
    const reading = readCycle(state, 70, T0 + 120 * MINUTE);
    expect(reading).toMatchObject({
      glucoseBelow250: true,
      reducedInsulinRate: 3.5,
      anionGap: 10,
      deltaDelta: { ratio: -0.25, reading: 'hipercloremica' },
      resolution: { required: true, desirable: false, resolved: true },
      transition: { totalDailyMin: 35, totalDailyMax: 42 },
    });
  });

  it('na primeira rodada não há intervalo nem queda', () => {
    const reading = readCycle(
      run([{ type: 'digitar-rodada', field: 'glicemia', raw: '300' }]),
      null,
      T0,
    );
    expect(reading).toMatchObject({ minutes: null, fall: null, transition: null });
  });
});

describe('estado salvo na sessão', () => {
  it('volta igual depois de ir e vir pelo JSON', () => {
    const state = run([
      { type: 'ir-para', screen: 'ciclo' },
      { type: 'digitar-exame', field: 'potassio', raw: '3,8' },
      { type: 'precipitante', id: 'infeccao' },
      { type: 'digitar-rodada', field: 'glicemia', raw: '450' },
      { type: 'nova-rodada', at: T0 },
    ]);
    expect(parseCadEhhState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('recusa formato estranho', () => {
    expect(parseCadEhhState(null)).toBeNull();
    expect(parseCadEhhState({ ...INITIAL_CAD_EHH_STATE, screen: 'outra' })).toBeNull();
    expect(parseCadEhhState({ ...INITIAL_CAD_EHH_STATE, insulinRate: 1 })).toBeNull();
    expect(parseCadEhhState({ ...INITIAL_CAD_EHH_STATE, precipitants: ['inventado'] })).toBeNull();
    expect(
      parseCadEhhState({
        ...INITIAL_CAD_EHH_STATE,
        panel: { ...INITIAL_CAD_EHH_STATE.panel, potassio: 4 },
      }),
    ).toBeNull();
    expect(
      parseCadEhhState({
        ...INITIAL_CAD_EHH_STATE,
        cycle: { ...INITIAL_CAD_EHH_STATE.cycle, previous: { at: 'ontem', values: {} } },
      }),
    ).toBeNull();
  });
});
