import { describe, expect, it } from 'vitest';
import {
  buildToxidromeChartNote,
  INITIAL_TOXIDROME_FLOW,
  QUESTION_IDS,
  TOXIDROME_IDS,
  TOXIDROME_QUESTIONS,
  TOXIDROMES,
  toxidromeAnswers,
  toxidromeFlowReducer,
  toxidromeProgress,
  toxidromeStep,
  VITAL_SIGN_LABELS,
  type ToxidromeFlowState,
  type ToxidromeId,
} from './toxidromes';

function answer(...values: string[]): ToxidromeFlowState {
  return values.reduce(
    (state, value) => toxidromeFlowReducer(state, { type: 'answer', value }),
    INITIAL_TOXIDROME_FLOW,
  );
}

function resultOf(state: ToxidromeFlowState): ToxidromeId | null {
  const step = toxidromeStep(state);
  return step.kind === 'result' ? step.toxidrome.id : null;
}

/** Todos os caminhos da árvore, da pergunta 1 a uma toxíndrome. */
function allPaths(): { values: string[]; result: ToxidromeId }[] {
  const paths: { values: string[]; result: ToxidromeId }[] = [];
  const visit = (values: string[]) => {
    const step = toxidromeStep(answer(...values));
    if (step.kind === 'result') {
      paths.push({ values, result: step.toxidrome.id });
      return;
    }
    for (const option of step.question.options) visit([...values, option.value]);
  };
  visit([]);
  return paths;
}

describe('árvore de toxíndromes (CC-323)', () => {
  it('tem 11 perguntas e 8 toxíndromes, como o ANY', () => {
    expect(TOXIDROME_QUESTIONS).toHaveLength(11);
    expect(TOXIDROME_QUESTIONS.map(({ id }) => id)).toEqual([...QUESTION_IDS]);
    expect(TOXIDROME_IDS).toHaveLength(8);
    expect(Object.keys(TOXIDROMES)).toEqual([...TOXIDROME_IDS]);
  });

  it('toda pergunta é alcançada e toda toxíndrome é um fim possível', () => {
    const reached = new Set<number>();
    const visit = (values: string[]) => {
      const step = toxidromeStep(answer(...values));
      if (step.kind === 'result') return;
      reached.add(step.question.id);
      for (const option of step.question.options) visit([...values, option.value]);
    };
    visit([]);
    expect([...reached].sort((a, b) => a - b)).toEqual([...QUESTION_IDS]);
    expect(new Set(allPaths().map(({ result }) => result))).toEqual(new Set(TOXIDROME_IDS));
  });

  it('não repete valor de opção numa pergunta e todo destino existe', () => {
    for (const question of TOXIDROME_QUESTIONS) {
      const values = question.options.map(({ value }) => value);
      expect(new Set(values).size, `pergunta ${question.id}`).toBe(values.length);
      for (const option of question.options) {
        if (option.next !== undefined) expect(QUESTION_IDS).toContain(option.next);
        else expect(TOXIDROME_IDS).toContain(option.result);
      }
    }
  });

  it('toda toxíndrome tem sinais, os 7 sinais vitais, agentes e próximo passo', () => {
    for (const id of TOXIDROME_IDS) {
      const toxidrome = TOXIDROMES[id];
      expect(toxidrome.id).toBe(id);
      expect(toxidrome.signs.length).toBeGreaterThan(0);
      expect(Object.keys(toxidrome.vitals)).toEqual(Object.keys(VITAL_SIGN_LABELS));
      expect(toxidrome.agents).not.toBe('');
      expect(toxidrome.treatment).not.toBe('');
    }
  });

  it.each([
    [['rebaixado', 'miose', 'sim'], 'opioide'],
    [['rebaixado', 'miose', 'nao', 'sim'], 'colinergico'],
    [['rebaixado', 'midriase', 'nao'], 'sedativo'],
    [['agitado', 'midriase', 'seca', 'sim'], 'anticolinergico'],
    [['agitado', 'midriase', 'seca', 'nao'], 'simpaticomimetico'],
    [['agitado', 'midriase', 'umida', 'sim'], 'serotoninergico'],
    [['agitado', 'midriase', 'normal', 'nao'], 'simpaticomimetico'],
    [['agitado', 'miose', 'sim'], 'colinergico'],
    [['agitado', 'normais', 'nao'], 'misto'],
    [['agitado', 'normais', 'sim', 'sim'], 'serotoninergico'],
    [['normal', 'sim'], 'misto'],
    [['normal', 'nao'], 'normal'],
  ] as const)('%j → %s', (values, expected) => {
    expect(resultOf(answer(...values))).toBe(expected);
  });
});

describe('reducer do roteiro', () => {
  it('começa na pergunta 1, "Pergunta 1"', () => {
    expect(toxidromeStep(INITIAL_TOXIDROME_FLOW)).toMatchObject({
      kind: 'question',
      question: { id: 1 },
      number: 1,
    });
  });

  it('ignora resposta que não existe na pergunta da vez', () => {
    const state = answer('agitado');
    expect(toxidromeFlowReducer(state, { type: 'answer', value: 'sim' })).toBe(state);
  });

  it('ignora resposta depois do resultado', () => {
    const state = answer('normal', 'nao');
    expect(toxidromeFlowReducer(state, { type: 'answer', value: 'sim' })).toBe(state);
  });

  it('"Pergunta anterior" desfaz a última resposta, inclusive a que deu o resultado', () => {
    const done = answer('rebaixado', 'miose', 'sim');
    const back = toxidromeFlowReducer(done, { type: 'back' });
    expect(toxidromeStep(back)).toMatchObject({
      kind: 'question',
      question: { id: 11 },
      number: 3,
    });
    expect(toxidromeFlowReducer(INITIAL_TOXIDROME_FLOW, { type: 'back' })).toBe(
      INITIAL_TOXIDROME_FLOW,
    );
  });

  it('"Recomeçar" volta ao início', () => {
    expect(toxidromeFlowReducer(answer('normal', 'sim'), { type: 'restart' })).toEqual(
      INITIAL_TOXIDROME_FLOW,
    );
  });

  it('progresso de 20% por resposta, até 95% antes do resultado e 100% no fim', () => {
    expect(toxidromeProgress(INITIAL_TOXIDROME_FLOW)).toBe(0);
    expect(toxidromeProgress(answer('agitado'))).toBe(20);
    expect(toxidromeProgress(answer('normal', 'nao'))).toBe(40);
    expect(toxidromeProgress(answer('agitado', 'midriase', 'seca', 'sim'))).toBe(80);
  });

  it('falha alto com resposta gravada fora do caminho', () => {
    expect(() => toxidromeStep({ answers: [{ questionId: 2, value: 'miose' }] })).toThrow(
      /não cabe/,
    );
  });
});

describe('texto para o prontuário', () => {
  it('só existe com resultado', () => {
    expect(buildToxidromeChartNote(answer('rebaixado'))).toBeNull();
  });

  it('traz a toxíndrome, o caminho, o próximo passo e a fonte, sem dado de paciente', () => {
    const state = answer('rebaixado', 'miose', 'sim');
    const note = buildToxidromeChartNote(state);
    expect(note).toContain('Toxicologia — possível toxíndrome: Opioide.');
    expect(note).toContain('- Há depressão respiratória (FR < 12 ou apneia)? Sim');
    expect(note).toContain('Sugestão: Considere NALOXONA — Disponível.');
    expect(note).toContain('Disque-Intoxicação: 0800 722 6001');
    expect(note).toContain('revisão clínica pendente');
    expect(toxidromeAnswers(state)).toHaveLength(3);
  });
});
