import { describe, expect, it } from 'vitest';
import { evaluateCalculator, type CalculatorEvaluation } from '../calculator';
import { PERC_RULE } from '../calculators/perc-rule';
import { D_DIMER_AGE_ADJUSTED } from './d-dimer';
import { ECHO_RV } from './echo';
import {
  buildTepChartNote,
  classificationAnswerFor,
  diagnosisActionFor,
  INITIAL_TEP_STATE,
  parseTepPathwayState,
  showsDDimer,
  showsPerc,
  tepReducer,
  tepStepNumber,
  wellsLevelFor,
  type TepAction,
  type TepPathwayState,
} from './pathway';
import { PESI } from './severity';

function run(actions: readonly TepAction[], from: TepPathwayState = INITIAL_TEP_STATE) {
  return actions.reduce(tepReducer, from);
}

function complete(evaluation: CalculatorEvaluation) {
  if (evaluation.status !== 'complete') throw new Error('incompleto');
  return evaluation;
}

const STABLE: TepAction = { type: 'estabilidade', stable: true };
const UNSTABLE: TepAction = { type: 'estabilidade', stable: false };

describe('tepReducer — caminho estável', () => {
  it('leva de sintomático, sPESI ≥ 1, ambos os marcadores e hipoperfusão a D2R', () => {
    const state = run([
      STABLE,
      { type: 'confirmar-tep' },
      { type: 'responder', answer: 'sintomatico' },
      { type: 'responder', answer: 'risco-elevado' },
      { type: 'responder', answer: 'c3' },
      { type: 'responder', answer: 'd2' },
      { type: 'responder', answer: 'com-r' },
    ]);
    expect(state).toMatchObject({ step: 'conduta', category: 'D2', respiratory: true });
    expect(tepStepNumber(state.step)).toBe(4);
  });

  it('passa pelo Hestia no baixo risco e guarda a resposta, sem mudar a categoria', () => {
    const state = run([
      STABLE,
      { type: 'confirmar-tep' },
      { type: 'responder', answer: 'sintomatico' },
      { type: 'responder', answer: 'baixo-risco' },
      { type: 'responder', answer: 'hestia-positivo' },
      { type: 'responder', answer: 'segmentar' },
      { type: 'responder', answer: 'sem-r' },
    ]);
    expect(state).toMatchObject({
      category: 'B2',
      classification: { symptomatic: true, risk: 'baixo', hestia: 'positivo' },
    });
  });

  it('ignora resposta que não é da pergunta atual', () => {
    const asked = run([STABLE, { type: 'confirmar-tep' }]);
    expect(tepReducer(asked, { type: 'responder', answer: 'c3' })).toBe(asked);
    expect(tepReducer(asked, { type: 'responder', answer: 'com-r' })).toBe(asked);
  });

  it('"voltar" na classificação zera as respostas e volta ao diagnóstico', () => {
    const state = run([
      STABLE,
      { type: 'confirmar-tep' },
      { type: 'responder', answer: 'assintomatico' },
      { type: 'voltar' },
    ]);
    expect(state).toMatchObject({
      step: 'diagnostico',
      question: 'sintomas',
      classification: {},
      category: null,
    });
  });
});

describe('tepReducer — investigação', () => {
  it('trocar a gestação zera Wells, PERC, D-dímero e YEARS', () => {
    const state = run([
      STABLE,
      { type: 'wells', level: 'baixa' },
      { type: 'perc', result: 'positivo' },
      { type: 'd-dimero', result: 'negativo' },
      { type: 'gestante', pregnant: true },
    ]);
    expect(state.diagnosis).toEqual({
      pregnant: true,
      wells: null,
      perc: null,
      dDimer: null,
      yearsPregnancy: null,
    });
  });

  it('novo Wells zera PERC e D-dímero', () => {
    const state = run([
      STABLE,
      { type: 'wells', level: 'baixa' },
      { type: 'perc', result: 'positivo' },
      { type: 'd-dimero', result: 'positivo' },
      { type: 'wells', level: 'intermediaria' },
    ]);
    expect(state.diagnosis).toMatchObject({ wells: 'intermediaria', perc: null, dDimer: null });
  });

  it('só aceita PERC no Wells baixo e D-dímero quando o ANY o mostra', () => {
    const high = run([STABLE, { type: 'wells', level: 'alta' }]);
    expect(showsPerc(high.diagnosis)).toBe(false);
    expect(showsDDimer(high.diagnosis)).toBe(false);
    expect(tepReducer(high, { type: 'perc', result: 'negativo' })).toBe(high);
    expect(tepReducer(high, { type: 'd-dimero', result: 'negativo' })).toBe(high);
    const lowNegative = run([
      STABLE,
      { type: 'wells', level: 'baixa' },
      { type: 'perc', result: 'negativo' },
    ]);
    expect(showsDDimer(lowNegative.diagnosis)).toBe(false);
  });

  it('não muda a investigação fora do passo 2', () => {
    expect(tepReducer(INITIAL_TEP_STATE, { type: 'wells', level: 'alta' })).toBe(INITIAL_TEP_STATE);
  });
});

describe('tepReducer — paciente instável', () => {
  it('classifica direto com R e mantém o eco e a trombólise do passo', () => {
    const state = run([
      UNSTABLE,
      { type: 'eco', finding: 'tapse', present: true },
      { type: 'trombolise', answer: 'sem-contraindicacao' },
      { type: 'trombolise', answer: 'risco-alto' },
      { type: 'classificar-instavel', category: 'E1' },
    ]);
    expect(state).toMatchObject({
      step: 'conduta',
      category: 'E1',
      respiratory: true,
      thrombolysis: 'dose-reduzida',
      echo: { tapse: 'sim' },
    });
  });

  it('a trombólise só anda pelos botões que existem em cada etapa', () => {
    const unstable = run([UNSTABLE]);
    expect(tepReducer(unstable, { type: 'trombolise', answer: 'risco-alto' })).toBe(unstable);
    const contraindicated = tepReducer(unstable, { type: 'trombolise', answer: 'contraindicada' });
    expect(contraindicated.thrombolysis).toBe('contraindicada');
    expect(
      tepReducer(contraindicated, { type: 'trombolise', answer: 'reavaliar' }).thrombolysis,
    ).toBe('contraindicacao');
  });

  it('ignora achado de eco que não existe', () => {
    const unstable = run([UNSTABLE]);
    expect(tepReducer(unstable, { type: 'eco', finding: 'inventado', present: true })).toBe(
      unstable,
    );
  });

  it('"reiniciar" zera tudo, inclusive eco e trombólise', () => {
    const state = run([
      UNSTABLE,
      { type: 'eco', finding: 'rv-lv', present: true },
      { type: 'trombolise', answer: 'contraindicada' },
      { type: 'classificar-instavel', category: 'D' },
      { type: 'reiniciar' },
    ]);
    expect(state).toEqual(INITIAL_TEP_STATE);
  });
});

describe('calculadoras dentro do roteiro', () => {
  it('Wells: < 2 baixa, 2–6 intermediária, > 6 alta', () => {
    expect([0, 1.5, 2, 6, 6.5, 12.5].map(wellsLevelFor)).toEqual([
      'baixa',
      'baixa',
      'intermediaria',
      'intermediaria',
      'alta',
      'alta',
    ]);
  });

  it('PERC e D-dímero viram o resultado do passo', () => {
    const negative = complete(
      evaluateCalculator(PERC_RULE, {
        items: Object.fromEntries(PERC_RULE.items.map((item) => [item.id, 'nao'])),
      }),
    );
    expect(diagnosisActionFor('perc', negative)).toEqual({ type: 'perc', result: 'negativo' });
    const positive = complete(
      evaluateCalculator(D_DIMER_AGE_ADJUSTED, { inputs: { age: '70', 'd-dimer': '700' } }),
    );
    expect(diagnosisActionFor('dDimer', positive)).toEqual({
      type: 'd-dimero',
      result: 'positivo',
    });
  });

  it('PESI classe II é baixo risco; classe III é risco elevado', () => {
    const pesi = (age: string) =>
      complete(
        evaluateCalculator(PESI, {
          inputs: { age },
          items: Object.fromEntries(PESI.items?.map((item) => [item.id, 'nao']) ?? []),
        }),
      );
    expect(classificationAnswerFor('pesi', pesi('85'))).toBe('baixo-risco');
    expect(classificationAnswerFor('pesi', pesi('86'))).toBe('risco-elevado');
  });
});

describe('parseTepPathwayState', () => {
  it('aceita o estado que o reducer produz (ida e volta por JSON)', () => {
    const state = run([
      UNSTABLE,
      { type: 'eco', finding: 'mcconnell', present: false },
      { type: 'classificar-instavel', category: 'E2' },
    ]);
    expect(parseTepPathwayState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(parseTepPathwayState(INITIAL_TEP_STATE)).toEqual(INITIAL_TEP_STATE);
  });

  it('recusa formato estranho em vez de abrir num estado quebrado', () => {
    expect(parseTepPathwayState(null)).toBeNull();
    expect(parseTepPathwayState('estabilidade')).toBeNull();
    expect(parseTepPathwayState({ ...INITIAL_TEP_STATE, step: 'outro' })).toBeNull();
    expect(parseTepPathwayState({ ...INITIAL_TEP_STATE, category: 'F1' })).toBeNull();
    expect(
      parseTepPathwayState({ ...INITIAL_TEP_STATE, diagnosis: { pregnant: 'sim' } }),
    ).toBeNull();
    expect(parseTepPathwayState({ ...INITIAL_TEP_STATE, echo: { tapse: 'talvez' } })).toBeNull();
    // Conduta sem categoria não tem o que mostrar.
    expect(parseTepPathwayState({ ...INITIAL_TEP_STATE, step: 'conduta' })).toBeNull();
  });
});

describe('buildTepChartNote', () => {
  it('não existe antes da conduta', () => {
    expect(buildTepChartNote(INITIAL_TEP_STATE)).toBeNull();
  });

  it('traz a categoria, o quadro de destino, a conduta e o caminho', () => {
    const note = buildTepChartNote(
      run([
        STABLE,
        { type: 'wells', level: 'intermediaria' },
        { type: 'd-dimero', result: 'positivo' },
        { type: 'confirmar-tep' },
        { type: 'responder', answer: 'sintomatico' },
        { type: 'responder', answer: 'risco-elevado' },
        { type: 'responder', answer: 'c2' },
        { type: 'responder', answer: 'com-r' },
      ]),
    );
    expect(note).toContain('TEP — categoria C2R (classificação AHA/ACC)');
    expect(note).toContain('Destino: Enfermaria / semi-intensiva.');
    expect(note).toContain('Anticoagulação: DOAC ou HBPM.');
    expect(note).toContain('- Monitorização próxima');
    expect(note).toContain('- Risco (sPESI/PESI): elevado');
    expect(note).toContain('- Modificador respiratório (R): presente');
    expect(note).toContain('- Wells: probabilidade intermediária (2–6)');
    expect(note).toContain('- D-dímero: positivo');
    expect(note).toContain('revisão clínica pendente');
  });

  it('no instável, diz que veio da instabilidade e resume o eco respondido', () => {
    let state = run([UNSTABLE]);
    for (const item of ECHO_RV.items) {
      state = tepReducer(state, { type: 'eco', finding: item.id, present: item.id !== 'thrombus' });
    }
    const note = buildTepChartNote(
      tepReducer(state, { type: 'classificar-instavel', category: 'E2' }),
    );
    expect(note).toContain('categoria E2R');
    expect(note).toContain('- Classificado pela instabilidade hemodinâmica');
    expect(note).toContain('Eco à beira-leito: Disfunção grave de VD (6 achados).');
  });
});
