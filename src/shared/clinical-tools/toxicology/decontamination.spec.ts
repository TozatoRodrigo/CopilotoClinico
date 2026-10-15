import { describe, expect, it } from 'vitest';
import { validateNumber } from '../ranges';
import {
  activatedCharcoalDose,
  buildDecontaminationChartNote,
  decontaminationFlowReducer,
  decontaminationProgress,
  decontaminationView,
  DECONTAMINATION_INTRO,
  DECONTAMINATION_RESULT_IDS,
  DECONTAMINATION_STEPS,
  INITIAL_DECONTAMINATION_FLOW,
  REDUCED_BENEFIT_TEXT,
  TOX_WEIGHT_RANGE,
  type DecontaminationFlowState,
} from './decontamination';
import { DISQUE_INTOXICACAO } from './ciatox';

function run(...values: string[]): DecontaminationFlowState {
  return values.reduce(
    (state, value) => decontaminationFlowReducer(state, { type: 'answer', value }),
    decontaminationFlowReducer(INITIAL_DECONTAMINATION_FLOW, { type: 'start' }),
  );
}

function resultId(state: DecontaminationFlowState) {
  const view = decontaminationView(state);
  return view.kind === 'result' ? view.result.id : null;
}

describe('descontaminação GI em 5 passos (CC-323)', () => {
  it('tem 5 passos e 7 resultados, todos alcançáveis', () => {
    expect(DECONTAMINATION_STEPS.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
    const reached = new Set<string>();
    const visit = (values: string[]) => {
      const view = decontaminationView(run(...values));
      if (view.kind === 'result') {
        reached.add(view.result.id);
        return;
      }
      if (view.kind !== 'question') throw new Error('roteiro parado na abertura');
      for (const option of view.step.options) visit([...values, option.value]);
    };
    visit([]);
    expect(reached).toEqual(new Set(DECONTAMINATION_RESULT_IDS));
  });

  it('abre na tela de abertura, que cita o Disque-Intoxicação', () => {
    expect(decontaminationView(INITIAL_DECONTAMINATION_FLOW)).toEqual({ kind: 'intro' });
    expect(DECONTAMINATION_INTRO.caution).toContain(DISQUE_INTOXICACAO.phone);
  });

  it.each([
    [['caustico'], 'caustico'],
    [['incerto'], 'incerto'],
    [['nao', 'mais_2h'], 'nao-indicado-tempo'],
    [['nao', 'menos_1h', 'nao_adsorvida'], 'nao-indicado-adsorcao'],
    [['nao', 'menos_1h', 'incerto_subst'], 'incerto'],
    [['nao', 'menos_1h', 'adsorvida', 'rebaixado'], 'proteger-via-aerea'],
    [['nao', 'menos_1h', 'adsorvida', 'consciente', 'com_ci'], 'nao-indicado-contraindicacao'],
    [['nao', 'menos_1h', 'adsorvida', 'consciente', 'sem_ci'], 'indicado'],
  ] as const)('%j → %s', (values, expected) => {
    expect(resultId(run(...values))).toBe(expected);
  });

  it('carvão "indicado" com benefício reduzido se a ingestão foi há 1–2 h ou em hora desconhecida', () => {
    const reduced = (time: string) => {
      const view = decontaminationView(run('nao', time, 'adsorvida', 'consciente', 'sem_ci'));
      return view.kind === 'result' && view.reducedBenefit;
    };
    expect(reduced('menos_1h')).toBe(false);
    expect(reduced('1_2h')).toBe(true);
    expect(reduced('desconhecido')).toBe(true);
  });

  it('progresso: passo atual sobre 5, 100% no resultado', () => {
    expect(decontaminationProgress(INITIAL_DECONTAMINATION_FLOW)).toBe(0);
    expect(decontaminationProgress(run())).toBe(20);
    expect(decontaminationProgress(run('nao', 'menos_1h'))).toBe(60);
    expect(decontaminationProgress(run('caustico'))).toBe(100);
  });

  it('volta um passo, volta à abertura e recomeça', () => {
    const atStep3 = run('nao', 'menos_1h');
    const back = decontaminationFlowReducer(atStep3, { type: 'back' });
    expect(decontaminationView(back)).toMatchObject({ kind: 'question', step: { id: 2 } });
    const toIntro = decontaminationFlowReducer(run(), { type: 'back' });
    expect(decontaminationView(toIntro)).toEqual({ kind: 'intro' });
    expect(decontaminationFlowReducer(atStep3, { type: 'restart' })).toEqual(
      INITIAL_DECONTAMINATION_FLOW,
    );
  });

  it('ignora resposta antes de iniciar e depois do resultado', () => {
    expect(
      decontaminationFlowReducer(INITIAL_DECONTAMINATION_FLOW, { type: 'answer', value: 'nao' }),
    ).toBe(INITIAL_DECONTAMINATION_FLOW);
    const done = run('caustico');
    expect(decontaminationFlowReducer(done, { type: 'answer', value: 'nao' })).toBe(done);
  });
});

describe('carvão ativado: 1 g/kg, entre 25 e 100 g', () => {
  it.each([
    [10, 25],
    [25, 25],
    [40, 40],
    [70.4, 70],
    [70.5, 71],
    [100, 100],
    [150, 100],
    [300, 100],
  ])('%s kg → %s g', (weight, grams) => {
    expect(activatedCharcoalDose(weight)).toBe(grams);
  });

  it('aceita de 0,5 a 300 kg', () => {
    expect(validateNumber('0,4', TOX_WEIGHT_RANGE).ok).toBe(false);
    expect(validateNumber('0,5', TOX_WEIGHT_RANGE).ok).toBe(true);
    expect(validateNumber('300', TOX_WEIGHT_RANGE).ok).toBe(true);
    expect(validateNumber('301', TOX_WEIGHT_RANGE).ok).toBe(false);
  });
});

describe('texto para o prontuário', () => {
  it('só existe com resultado', () => {
    expect(buildDecontaminationChartNote(run('nao'), 70)).toBeNull();
  });

  it('com carvão indicado e peso, leva a dose', () => {
    const note = buildDecontaminationChartNote(
      run('nao', '1_2h', 'adsorvida', 'consciente', 'sem_ci'),
      70,
    );
    expect(note).toContain('Descontaminação GI: Carvão ativado pode ser considerado.');
    expect(note).toContain('- Quanto tempo desde a ingestão? 1-2 horas');
    expect(note).toContain(`${REDUCED_BENEFIT_TEXT}.`);
    expect(note).toContain('Carvão ativado: 70 g para 70 kg');
  });

  it('sem carvão não fala em dose', () => {
    const note = buildDecontaminationChartNote(run('caustico'), 70);
    expect(note).toContain('Descontaminação GI: Contraindicação absoluta.');
    expect(note).not.toContain('Carvão ativado:');
  });
});
