import { describe, expect, it } from 'vitest';
import {
  buildSepticChartNote,
  computeSepticProfile,
  describeSepticEvent,
  INITIAL_SEPTIC_STATE,
  isPristineSepticState,
  parseSepticShockState,
  readSepticValues,
  septicShockReducer,
  tecReevaluations,
  type SepticShockAction,
  type SepticShockState,
} from './septic-roteiro';

/** 13h00 de 15/10/2026 (UTC) e minutos depois: o tempo entra pela ação. */
const T0 = Date.UTC(2026, 9, 15, 13, 0);
const minutes = (count: number) => T0 + count * 60_000;

function run(actions: readonly SepticShockAction[], from = INITIAL_SEPTIC_STATE) {
  return actions.reduce(septicShockReducer, from);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Os cinco passos, com duas reavaliações do TEC no fim. */
const FULL_ROTEIRO: readonly SepticShockAction[] = [
  { type: 'marcar-criterio', criterion: 'infeccao' },
  { type: 'unidade-do-lactato', unit: 'mg/dL' },
  { type: 'digitar', field: 'lactate', raw: '45' },
  { type: 'tec-digitado', raw: '5,5' },
  { type: 'iniciar-tier-1', at: minutes(0) },
  { type: 'digitar', field: 'pp', raw: '32' },
  { type: 'metodo-de-fluidorresponsividade', method: 'elevacao-mmii' },
  { type: 'responsivo-a-fluidos', answer: 'sim' },
  { type: 'adicionar-bolus', at: minutes(5) },
  { type: 'tec-apos-fluidos', normalized: false, at: minutes(35) },
  { type: 'tec-apos-fluidos', normalized: false, at: minutes(65) },
  { type: 'digitar', field: 'pad', raw: '45' },
  { type: 'digitar', field: 'fc', raw: '110' },
  { type: 'digitar', field: 'doseNE', raw: '0,2' },
  { type: 'tec-apos-vasopressor', normalized: false, at: minutes(70) },
  { type: 'marcar-eco', finding: 've-hipocinetico' },
  { type: 'digitar', field: 'svco2', raw: '62' },
  { type: 'digitar', field: 'gapCO2', raw: '8' },
  { type: 'avancar', at: minutes(80) },
  { type: 'reavaliar-tec', value: 4.2, at: minutes(140) },
  { type: 'reavaliar-tec', value: 2.8, at: minutes(200) },
];

describe('roteiro do choque séptico (CC-316)', () => {
  it('critério de aceite 1: completo os 5 passos e a linha do tempo mostra cada reavaliação com horário', () => {
    const state = run(FULL_ROTEIRO);

    expect(state.step).toBe('perfil');
    expect(state.events.map((event) => [event.at, describeSepticEvent(event)])).toEqual([
      [minutes(0), 'Reconhecimento: TEC 5,5 s, Lactato 5,0 mmol/L'],
      [minutes(5), 'Bolus cristaloide 500 mL (total: 500 mL)'],
      [minutes(35), 'Bolus cristaloide 500 mL (total: 1000 mL)'],
      [minutes(70), 'Vasopressor: NE 0,20 mcg/kg/min, PAD 45, FC 110, VNERi 2,0'],
      [minutes(80), 'Perfusão: SvcO2 62%, Gap CO2 8,0 mmHg (Baixo débito cardíaco / estase)'],
      [minutes(140), 'Reavaliação TEC: 4,2s'],
      [minutes(200), 'Reavaliação TEC: 2,8s'],
    ]);
    expect(tecReevaluations(state).map(({ at, value }) => [at, value])).toEqual([
      [minutes(140), 4.2],
      [minutes(200), 2.8],
    ]);
  });

  it('é puro: não muda o estado recebido e dá o mesmo resultado com as mesmas ações', () => {
    const frozen = deepFreeze(run(FULL_ROTEIRO.slice(0, 10)));
    const rest = FULL_ROTEIRO.slice(10);
    expect(JSON.stringify(run(rest, frozen))).toBe(JSON.stringify(run(rest, frozen)));
    expect(JSON.stringify(run(FULL_ROTEIRO))).toBe(JSON.stringify(run(FULL_ROTEIRO)));
  });

  it('a última reavaliação vira o TEC em vigor e muda o perfil, como no ANY', () => {
    const state = run(FULL_ROTEIRO);
    expect(state.tec).toEqual({ source: 'reavaliacao', value: 2.8 });
    expect(computeSepticProfile(state).findings[0]).toEqual({
      id: 'tec',
      text: 'TEC: 2,8 segundos',
      tone: 'neutral',
    });
  });

  it('reavaliação fora da faixa (0,1 a 20 s) não entra', () => {
    const state = run([{ type: 'reavaliar-tec', value: 25, at: T0 }]);
    expect(state).toBe(INITIAL_SEPTIC_STATE);
    expect(run([{ type: 'reavaliar-tec', value: Number.NaN, at: T0 }])).toBe(INITIAL_SEPTIC_STATE);
  });

  it('"Iniciar Tier 1" só sai do reconhecimento com TEC > 3 s', () => {
    const normal = run([{ type: 'tec-por-faixa', mode: 'normal' }]);
    expect(septicShockReducer(normal, { type: 'iniciar-tier-1', at: T0 })).toBe(normal);
    const abnormal = run([{ type: 'tec-por-faixa', mode: 'anormal' }]);
    expect(septicShockReducer(abnormal, { type: 'iniciar-tier-1', at: T0 }).step).toBe('fluidos');
  });

  it('TEC normal após fluidos vai direto ao perfil; o vasopressor também', () => {
    const fluids = run([
      { type: 'tec-digitado', raw: '4' },
      { type: 'iniciar-tier-1', at: T0 },
      { type: 'tec-apos-fluidos', normalized: true, at: minutes(30) },
    ]);
    expect(fluids.step).toBe('perfil');
    expect(fluids.events.at(-1)).toEqual({
      kind: 'tec-normalizado',
      at: minutes(30),
      after: 'fluidos',
    });

    const vasopressor = run(
      [
        { type: 'digitar', field: 'pad', raw: '55' },
        { type: 'tec-apos-vasopressor', normalized: true, at: minutes(40) },
      ],
      { ...INITIAL_SEPTIC_STATE, step: 'vasopressor' },
    );
    expect(vasopressor.step).toBe('perfil');
    expect(vasopressor.events.map(describeSepticEvent)).toEqual([
      'Vasopressor: NE -- mcg/kg/min, PAD 55, FC --',
      'TEC normalizado após vasopressor',
    ]);
  });

  it('"Próximo" não sai do reconhecimento nem passa do perfil', () => {
    expect(run([{ type: 'avancar', at: T0 }])).toBe(INITIAL_SEPTIC_STATE);
    const profile = { ...INITIAL_SEPTIC_STATE, step: 'perfil' as const };
    expect(septicShockReducer(profile, { type: 'avancar', at: T0 })).toBe(profile);
  });

  it('o passo de perfusão sem SvcO2 nem gap avança sem registro vazio', () => {
    const state = run([{ type: 'avancar', at: T0 }], {
      ...INITIAL_SEPTIC_STATE,
      step: 'perfusao',
    });
    expect(state.step).toBe('perfil');
    expect(state.events).toEqual([]);
  });

  it('os testes de PAM e de dobutamina entram na linha do tempo a cada resposta', () => {
    const state = run([
      { type: 'hipertensao-cronica', answer: 'sim' },
      { type: 'teste-pam', answer: 'nao', at: minutes(60) },
      { type: 'teste-dobutamina', answer: 'sim', at: minutes(120) },
    ]);
    expect(state.events.map(describeSepticEvent)).toEqual([
      'Teste PAM 80-85: TEC não normalizado',
      'Teste dobutamina 5 mcg/kg/min: TEC normalizado',
    ]);
    expect(computeSepticProfile(state).suggestions.map(({ id }) => id)).toEqual([
      'manterDobutamina',
    ]);
  });

  it('recomeçar volta ao estado inicial', () => {
    expect(run([...FULL_ROTEIRO, { type: 'recomecar' }])).toBe(INITIAL_SEPTIC_STATE);
    expect(isPristineSepticState(INITIAL_SEPTIC_STATE)).toBe(true);
    expect(isPristineSepticState(run(FULL_ROTEIRO))).toBe(false);
  });
});

describe('lactato no roteiro', () => {
  it('lê na unidade escolhida e guarda o raciocínio em mmol/L', () => {
    const mg = run([
      { type: 'unidade-do-lactato', unit: 'mg/dL' },
      { type: 'digitar', field: 'lactate', raw: '36' },
    ]);
    expect(readSepticValues(mg).lactateMmol).toBe(4);
    // Trocar a unidade relê o número digitado na unidade nova (o ANY ficava com o valor velho).
    const mmol = septicShockReducer(mg, { type: 'unidade-do-lactato', unit: 'mmol/L' });
    expect(readSepticValues(mmol).lactateMmol).toBeNull(); // 36 mmol/L passa do teto de 30
    const typed = septicShockReducer(mmol, { type: 'digitar', field: 'lactate', raw: '3,5' });
    expect(readSepticValues(typed).lactateMmol).toBe(3.5);
  });
});

describe('pressão de pulso', () => {
  it('no modo calculado é PAS − PAD, e PAD ≥ PAS não dá PP', () => {
    const state = run([
      { type: 'modo-da-pressao-de-pulso', mode: 'calculado' },
      { type: 'digitar', field: 'pas', raw: '90' },
      { type: 'digitar', field: 'pad', raw: '55' },
    ]);
    expect(readSepticValues(state).pulsePressure).toBe(35);
    const invalid = septicShockReducer(state, { type: 'digitar', field: 'pad', raw: '95' });
    expect(readSepticValues(invalid)).toMatchObject({
      pulsePressure: null,
      pulsePressureInvalid: true,
    });
  });

  it('a PAD é a mesma do passo do vasopressor', () => {
    const state = run([{ type: 'digitar', field: 'pad', raw: '48' }]);
    expect(readSepticValues(state).pad).toBe(48);
  });
});

describe('dose de noradrenalina (− e +)', () => {
  it('parte de 0,10 sem dose e fica entre 0,01 e 3', () => {
    expect(run([{ type: 'ajustar-noradrenalina', delta: 0.05 }]).fields.doseNE).toBe('0,15');
    const low = run([
      { type: 'digitar', field: 'doseNE', raw: '0,03' },
      { type: 'ajustar-noradrenalina', delta: -0.05 },
    ]);
    expect(low.fields.doseNE).toBe('0,01');
    const high = run([
      { type: 'digitar', field: 'doseNE', raw: '2,98' },
      { type: 'ajustar-noradrenalina', delta: 0.05 },
    ]);
    expect(high.fields.doseNE).toBe('3');
  });
});

describe('prontuário', () => {
  it('traz perfil, condutas, linha do tempo com horário e referência, sem dado do paciente', () => {
    const note = buildSepticChartNote(
      run(FULL_ROTEIRO),
      (at) => `${String((at - T0) / 60_000).padStart(3, '0')}min`,
      'Hernandez G, et al. JAMA. 2025.',
    );
    const lines = note.split('\n');
    expect(lines[0]).toBe(
      'Choque séptico (ANDROMEDA-SHOCK 2) — Choque misto — vasoplégico + cardiogênico.',
    );
    expect(lines).toContain('- 140min Reavaliação TEC: 4,2s');
    expect(lines).toContain('- 200min Reavaliação TEC: 2,8s');
    expect(lines.at(-1)).toBe('Referência: Hernandez G, et al. JAMA. 2025.');
  });
});

describe('estado salvo na sessão', () => {
  it('volta igual depois de ir e voltar como JSON', () => {
    const state = run(FULL_ROTEIRO);
    expect(parseSepticShockState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('descarta lixo e formato desconhecido', () => {
    expect(parseSepticShockState(null)).toBeNull();
    expect(parseSepticShockState({ step: 'passo-inexistente' })).toBeNull();
    const partial = parseSepticShockState({
      step: 'vasopressor',
      fields: { pad: '50', fc: 'x'.repeat(200) },
      events: [{ kind: 'reavaliacao-tec', at: T0, value: 3 }, { kind: 'outro' }, 'lixo'],
      bolusTotalMl: 5000,
      lactateUnit: 'g/L',
    }) as SepticShockState;
    expect(partial.step).toBe('vasopressor');
    expect(partial.fields).toMatchObject({ pad: '50', fc: '' });
    expect(partial.events).toEqual([{ kind: 'reavaliacao-tec', at: T0, value: 3 }]);
    expect(partial.bolusTotalMl).toBe(0);
    expect(partial.lactateUnit).toBe('mg/dL');
  });
});
