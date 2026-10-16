import { describe, expect, it } from 'vitest';
import { understandingFixture } from '../../../tests/fixtures/case-understanding';
import type { ClinicalCase } from '../case.schema';
import { resultRowFixture, strokeCaseFixture } from '../case-fixture';
import type { FunnelExchange, IntakeTrace, ResultRow } from '../records';
import {
  conversationExchanges,
  expectedReadingSeverity,
  expectedReadingSyndromes,
  gradeConversation,
  readingSeverity,
} from './conversation';

/**
 * CC-106 — a conversa antes do plano tem nota determinística: síndrome e
 * gravidade da leitura, voltas, tempo até a primeira pergunta e os fatos do
 * roteiro que as perguntas alcançaram.
 */

const strokeCase = strokeCaseFixture();

function exchange(questionId: string, factIds: string[]): FunnelExchange {
  return { questionId, question: `Pergunta ${questionId}?`, answer: 'Resposta.', factIds };
}

function intake(overrides: Partial<IntakeTrace> = {}): IntakeTrace {
  return {
    intakeId: 'conversa-1',
    path: 'ask',
    closeReason: 'all_answered',
    understanding: understandingFixture({ timeCritical: true }),
    readingModel: 'claude-haiku-5-5',
    readingMs: 1_500,
    readingCostUsd: 0.002,
    questions: [],
    exchanges: [exchange('intake-1', ['h-flutuacao']), exchange('intake-2', [])],
    simulator: { model: 'claude-haiku-5-5', costUsd: 0.001, latencyMs: 5 },
    firstQuestionMs: 2_100,
    ...overrides,
  };
}

function funnelRow(overrides: Partial<ResultRow> = {}): ResultRow {
  return resultRowFixture({ mode: 'funnel', intake: intake(), ...overrides });
}

function withConversation(conversation: ClinicalCase['expected']['conversation']): ClinicalCase {
  return strokeCaseFixture({ expected: { ...strokeCase.expected, conversation } });
}

describe('gradeConversation', () => {
  it('mede a leitura, as voltas e os fatos que as perguntas antes do plano alcançaram', () => {
    const grade = gradeConversation(
      withConversation({
        essentialQuestions: [
          // Basta um dos fatos: a flutuação vem da história ou de outro fato que a mostre.
          { about: 'se o déficit flutua', factIds: ['t-tc', 'h-flutuacao'] },
        ],
      }),
      funnelRow({
        turns: [
          { turnIndex: 0, output: null, exchanges: [exchange('q1', ['t-tc'])], simulator: null },
          { turnIndex: 1, output: null, exchanges: [], simulator: null },
        ],
      }),
    );

    expect(grade).toEqual({
      path: 'ask',
      questionsBeforePlan: 2,
      roundsToFinalPlan: 3,
      firstQuestionMs: 2_100,
      syndrome: {
        read: 'deficit-neurologico-focal',
        expected: ['deficit-neurologico-focal'],
        pass: true,
      },
      severity: { read: 'time_critical', expected: 'time_critical', pass: true },
      questionsWithScriptFact: 1,
      keyFacts: ['h-flutuacao'],
      keyFactsBeforePlan: ['h-flutuacao'],
      missingEssentialQuestions: [],
    });
  });

  it('acusa a pergunta essencial que nenhuma pergunta antes do plano alcançou', () => {
    const grade = gradeConversation(
      withConversation({
        essentialQuestions: [{ about: 'se o déficit flutua', factIds: ['h-flutuacao'] }],
      }),
      // O fato veio só depois do plano: a pergunta essencial faltou antes dele.
      funnelRow({
        intake: intake({ exchanges: [exchange('intake-1', [])] }),
        turns: [
          {
            turnIndex: 0,
            output: null,
            exchanges: [exchange('q1', ['h-flutuacao'])],
            simulator: null,
          },
        ],
      }),
    );

    expect(grade?.missingEssentialQuestions).toEqual(['se o déficit flutua']);
    expect(grade?.keyFactsBeforePlan).toEqual([]);
  });

  it('reprova a leitura que subestima a gravidade e aceita a que superestima', () => {
    const stable = gradeConversation(
      strokeCase,
      funnelRow({
        intake: intake({ understanding: understandingFixture({ timeCritical: false }) }),
      }),
    );
    const unstable = gradeConversation(
      strokeCase,
      funnelRow({
        intake: intake({
          understanding: understandingFixture({
            instability: { present: true, findings: ['PAS 80'] },
          }),
        }),
      }),
    );

    expect(stable?.severity).toEqual({ read: 'stable', expected: 'time_critical', pass: false });
    expect(unstable?.severity).toEqual({
      read: 'unstable',
      expected: 'time_critical',
      pass: true,
    });
  });

  it('aceita as síndromes que o caso lista quando a abertura não basta para tags[0]', () => {
    const grade = gradeConversation(
      withConversation({ syndromes: ['outro', 'pele-partes-moles'] }),
      funnelRow({ intake: intake({ understanding: understandingFixture({ syndrome: 'outro' }) }) }),
    );

    expect(grade?.syndrome).toEqual({
      read: 'outro',
      expected: ['outro', 'pele-partes-moles'],
      pass: true,
    });
  });

  it('não dá nota de leitura sem leitura válida nem cobra essencial sem o caso declarar', () => {
    const grade = gradeConversation(
      strokeCase,
      funnelRow({
        intake: intake({ path: 'disabled', understanding: null, exchanges: [] }),
      }),
    );

    expect(grade).toMatchObject({
      path: 'disabled',
      questionsBeforePlan: 0,
      syndrome: null,
      severity: null,
      missingEssentialQuestions: null,
    });
  });

  it('é null fora do afunilamento e nas execuções sem conversa (anteriores ao CC-106)', () => {
    expect(gradeConversation(strokeCase, resultRowFixture())).toBeNull();
    expect(gradeConversation(strokeCase, resultRowFixture({ mode: 'funnel' }))).toBeNull();
  });
});

describe('expectativas da leitura', () => {
  it('usa tags[0] e, no caso crítico, tempo-crítico quando o caso não declara', () => {
    expect(expectedReadingSyndromes(strokeCase)).toEqual(['deficit-neurologico-focal']);
    expect(expectedReadingSeverity(strokeCase)).toBe('time_critical');
    expect(expectedReadingSeverity(strokeCaseFixture({ critical: false }))).toBeNull();
  });

  it('usa a gravidade declarada no caso', () => {
    expect(expectedReadingSeverity(withConversation({ severity: 'unstable' }))).toBe('unstable');
  });

  it('dá a gravidade da leitura pela instabilidade e pelo tempo-crítico', () => {
    expect(
      readingSeverity({ instability: { present: false, findings: [] }, timeCritical: false }),
    ).toBe('stable');
    expect(
      readingSeverity({ instability: { present: true, findings: [] }, timeCritical: false }),
    ).toBe('unstable');
  });
});

describe('conversationExchanges', () => {
  it('junta as perguntas antes do plano e as rodadas do plano, na ordem', () => {
    const exchanges = conversationExchanges(
      funnelRow({
        turns: [{ turnIndex: 0, output: null, exchanges: [exchange('q1', [])], simulator: null }],
      }),
    );

    expect(exchanges.map((item) => item.questionId)).toEqual(['intake-1', 'intake-2', 'q1']);
  });
});
