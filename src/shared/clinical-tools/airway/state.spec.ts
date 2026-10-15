import { describe, expect, it } from 'vitest';
import {
  airwayReducer,
  INITIAL_AIRWAY_STATE,
  OUTCOME_CHOICES,
  outcomeChoices,
  parseAirwayState,
  type AirwayAction,
  type AirwayState,
} from './state';

function apply(state: AirwayState, ...actions: AirwayAction[]): AirwayState {
  return actions.reduce(airwayReducer, state);
}

describe('airwayReducer', () => {
  it('começa na tela inicial, passo 1, régua no valor inicial do ANY e sem desfecho', () => {
    expect(INITIAL_AIRWAY_STATE).toMatchObject({
      screen: 'inicio',
      step: 1,
      population: 'adulto',
      outcome: { status: 'pendente' },
      rates: {
        fentanil: 3,
        cetamina: 1.5,
        etomidato: 0.3,
        propofol: 1.5,
        rocuronio: 1.5,
        succinilcolina: 1.5,
      },
    });
  });

  it('ir a um passo abre o roteiro nele', () => {
    expect(apply(INITIAL_AIRWAY_STATE, { type: 'go-to-step', step: 8 })).toMatchObject({
      screen: 'roteiro',
      step: 8,
    });
  });

  describe('índice de choque > 1,0 marca o H (CC-315, critério 3)', () => {
    it('marca ao completar FC e PAS, e registra que a marcação foi automática', () => {
      const state = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'set-heart-rate', raw: '120' },
        { type: 'set-systolic', raw: '90' },
      );
      expect(state.crash).toEqual(['H']);
      expect(state.hFromShockIndex).toBe(true);
    });

    it('não marca com 1,0 exato nem com campo fora da faixa', () => {
      expect(
        apply(
          INITIAL_AIRWAY_STATE,
          { type: 'set-heart-rate', raw: '100' },
          { type: 'set-systolic', raw: '100' },
        ).crash,
      ).toEqual([]);
      expect(
        apply(
          INITIAL_AIRWAY_STATE,
          { type: 'set-heart-rate', raw: '300' },
          { type: 'set-systolic', raw: '90' },
        ).crash,
      ).toEqual([]);
    });

    it('H já marcado pelo médico continua do médico (sem aviso automático)', () => {
      const state = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'toggle-crash', letter: 'H' },
        { type: 'set-heart-rate', raw: '130' },
        { type: 'set-systolic', raw: '90' },
      );
      expect(state.crash).toEqual(['H']);
      expect(state.hFromShockIndex).toBe(false);
    });

    it('desmarcar o H é decisão do médico; nova digitação acima de 1,0 marca de novo', () => {
      const marked = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'set-heart-rate', raw: '130' },
        { type: 'set-systolic', raw: '90' },
      );
      const unmarked = airwayReducer(marked, { type: 'toggle-crash', letter: 'H' });
      expect(unmarked).toMatchObject({ crash: [], hFromShockIndex: false });
      expect(airwayReducer(unmarked, { type: 'set-heart-rate', raw: '140' })).toMatchObject({
        crash: ['H'],
        hFromShockIndex: true,
      });
    });

    it('corrigir o índice para baixo de 1,0 não desmarca o H (regra do ANY)', () => {
      const state = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'set-heart-rate', raw: '130' },
        { type: 'set-systolic', raw: '90' },
        { type: 'set-heart-rate', raw: '70' },
      );
      expect(state.crash).toEqual(['H']);
    });
  });

  it('um indutor e um BNM por vez; o fentanil é independente', () => {
    const state = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'toggle-drug', drug: 'cetamina' },
      { type: 'toggle-drug', drug: 'fentanil' },
      { type: 'toggle-drug', drug: 'rocuronio' },
      { type: 'toggle-drug', drug: 'etomidato' },
      { type: 'toggle-drug', drug: 'succinilcolina' },
    );
    expect(state.drugs).toEqual(['fentanil', 'etomidato', 'succinilcolina']);
    expect(airwayReducer(state, { type: 'toggle-drug', drug: 'etomidato' }).drugs).toEqual([
      'fentanil',
      'succinilcolina',
    ]);
  });

  it('a régua respeita a faixa e o passo da droga', () => {
    expect(
      airwayReducer(INITIAL_AIRWAY_STATE, { type: 'set-drug-rate', drug: 'etomidato', rate: 0.9 })
        .rates.etomidato,
    ).toBe(0.4);
  });

  it('"Continuar sem avaliar" a VAD anatômica vai para os dados do paciente', () => {
    expect(
      apply(
        INITIAL_AIRWAY_STATE,
        { type: 'go-to-step', step: 3 },
        { type: 'set-vad-assessment', value: 'sem-avaliar' },
      ),
    ).toMatchObject({ step: 4, vadAssessment: 'sem-avaliar' });
  });

  describe('desfecho (CC-315, critério 2)', () => {
    it('"Intubou? Não" abre o plano B; se falhar, o plano C; a crico estabelece a via aérea', () => {
      const failed = airwayReducer(INITIAL_AIRWAY_STATE, OUTCOME_CHOICES['nao-intubou'].action);
      expect(failed.outcome).toEqual({ status: 'falhou', planC: false });
      expect(outcomeChoices(failed.outcome)).toEqual(['resgate-deg', 'plano-b-falhou']);

      const planC = airwayReducer(failed, OUTCOME_CHOICES['plano-b-falhou'].action);
      expect(planC.outcome).toEqual({ status: 'falhou', planC: true });
      expect(outcomeChoices(planC.outcome)).toEqual(['resgate-deg', 'crico-estabelecida']);

      const crico = airwayReducer(planC, OUTCOME_CHOICES['crico-estabelecida'].action);
      expect(crico.outcome).toEqual({ status: 'resgatado', method: 'cricotireoidostomia' });
      expect(outcomeChoices(crico.outcome)).toEqual([]);
    });

    it('resgate com DEG no plano B', () => {
      expect(
        apply(
          INITIAL_AIRWAY_STATE,
          OUTCOME_CHOICES['nao-intubou'].action,
          OUTCOME_CHOICES['resgate-deg'].action,
        ).outcome,
      ).toEqual({ status: 'resgatado', method: 'deg' });
    });

    it('ignora resposta fora de ordem e permite corrigir', () => {
      const intubated = airwayReducer(INITIAL_AIRWAY_STATE, OUTCOME_CHOICES.intubou.action);
      expect(airwayReducer(intubated, { type: 'crico-established' }).outcome).toEqual({
        status: 'intubado',
      });
      expect(
        airwayReducer(intubated, { type: 'record-intubation', success: false }).outcome,
      ).toEqual({ status: 'intubado' });
      expect(airwayReducer(intubated, { type: 'clear-outcome' }).outcome).toEqual({
        status: 'pendente',
      });
    });
  });

  it('marca e desmarca itens de checklist', () => {
    const checked = airwayReducer(INITIAL_AIRWAY_STATE, {
      type: 'toggle-check',
      id: 'confirmacao-capnografia',
    });
    expect(checked.checked).toEqual(['confirmacao-capnografia']);
    expect(
      airwayReducer(checked, { type: 'toggle-check', id: 'confirmacao-capnografia' }).checked,
    ).toEqual([]);
  });

  it('recomeçar volta ao estado inicial', () => {
    const state = apply(
      INITIAL_AIRWAY_STATE,
      { type: 'go-to-step', step: 9 },
      { type: 'set-cormack', grade: 'III' },
      { type: 'reset' },
    );
    expect(state).toEqual(INITIAL_AIRWAY_STATE);
  });
});

describe('parseAirwayState', () => {
  const filled = apply(
    INITIAL_AIRWAY_STATE,
    { type: 'go-to-step', step: 10 },
    { type: 'toggle-indication', id: 'oxigenacao' },
    { type: 'set-heart-rate', raw: '130' },
    { type: 'set-systolic', raw: '90' },
    { type: 'toggle-drug', drug: 'etomidato' },
    { type: 'set-drug-rate', drug: 'etomidato', rate: 0.25 },
    { type: 'set-sex', sex: 'F' },
    { type: 'record-intubation', success: false },
    { type: 'toggle-check', id: 'plano-a-bougie' },
  );

  it('lê de volta o que foi salvo (ida e volta por JSON)', () => {
    expect(parseAirwayState(JSON.parse(JSON.stringify(filled)))).toEqual(filled);
  });

  it('recusa formato estranho em vez de abrir um roteiro pela metade', () => {
    expect(parseAirwayState(null)).toBeNull();
    expect(parseAirwayState({ ...filled, step: 12 })).toBeNull();
    expect(parseAirwayState({ ...filled, crash: ['X'] })).toBeNull();
    expect(
      parseAirwayState({ ...filled, outcome: { status: 'resgatado', method: 'traqueo' } }),
    ).toBeNull();
    expect(parseAirwayState({ ...filled, checked: ['nao-existe'] })).toBeNull();
    expect(parseAirwayState({ ...filled, heartRate: '1'.repeat(50) })).toBeNull();
    const { rates: _rates, ...withoutRates } = filled;
    expect(parseAirwayState(withoutRates)).toBeNull();
  });

  it('régua fora da faixa volta para a régua; dois indutores viram um', () => {
    const parsed = parseAirwayState({
      ...filled,
      rates: { ...filled.rates, propofol: 9 },
      drugs: ['cetamina', 'etomidato'],
    });
    expect(parsed?.rates.propofol).toBe(2.5);
    expect(parsed?.drugs).toEqual(['etomidato']);
  });
});
