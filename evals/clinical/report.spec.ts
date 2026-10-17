import { describe, expect, it } from 'vitest';
import type { CopilotOutput } from '../../src/modules/copilot/guardrails/output-validator';
import type { ClinicalCase } from './case.schema';
import { understandingFixture } from '../../tests/fixtures/case-understanding';
import { resultRowFixture, strokeCaseFixture } from './case-fixture';
import { findFlips, renderComparison } from './compare';
import { gradeConversation } from './graders/conversation';
import { gradeDeterministic } from './graders/deterministic';
import type { JudgeOutcome } from './graders/judge';
import { assessCriticalError } from './grading';
import type { ErrorRow, GradeRow, ResultRow, RunMeta } from './records';
import { renderSummaryMarkdown, summarizeRun, type LoadedRun } from './report';

const criticalCase = strokeCaseFixture();
const nonCriticalCase = strokeCaseFixture({
  id: 'kb001-sg-001',
  critical: false,
  expected: {
    ...criticalCase.expected,
    diagnoses: [{ text: 'síndrome gripal', tier: 'important' }],
    actions: [{ text: 'sintomáticos', tier: 'important', timing: 'any' }],
    forbiddenDefinitiveActions: [],
  },
});
const casesById = new Map<string, ClinicalCase>(
  [criticalCase, nonCriticalCase].map((clinicalCase) => [clinicalCase.id, clinicalCase]),
);

const clarifyingOutput: CopilotOutput = {
  reasoning: 'Cefaleia forte sem dados: excluir hemorragia subaracnoide e meningite.',
  redFlags: [],
  recommendations: [],
  uncertainty: true,
  uncertaintyReason: 'Sem diretriz específica',
  differentials: [],
  clarifyingQuestions: [
    {
      id: 'q1',
      question: 'A dor atingiu o máximo em menos de 1 minuto?',
      why: 'Cefaleia em trovoada exige excluir HSA',
      criticality: 'blocker',
      expectedAnswerType: 'boolean',
    },
  ],
};

function meta(caseIds: string[], judged: boolean): RunMeta {
  return {
    runId: 'run-a',
    variant: { name: 'baseline', description: 'teste', env: {} },
    startedAt: '2026-10-10T00:00:00.000Z',
    finishedAt: '2026-10-10T00:01:00.000Z',
    git: { commit: 'abc', dirty: false },
    caseSet: { set: 'main', version: 'v1', selector: null, caseIds },
    reps: 1,
    mode: 'complete',
    concurrency: 1,
    caseTimeoutMs: 1_000,
    database: 'u@localhost:5432/db',
    pipeline: {
      completionProvider: 'openai',
      embeddingProvider: 'openai',
      requestedModel: 'm',
      embeddingModel: 'e',
      maxOutputTokens: 16_000,
      effort: 'high',
      reasoning: 'legacy',
      understandingModel: null,
      understandingEffort: null,
      decisionPrompt: 'v1',
      knowledgeSource: 'internal_kb',
      whyLine: false,
      decisionModel: null,
      decisionCriticalModel: null,
      research: null,
      structuredOutput: true,
      refusalFallback: false,
      intake: null,
    },
    knowledgeBase: { approvedChunks: 10, approvedChunksWithEmbedding: 10, officialChunks: 0 },
    judge: judged
      ? { provider: 'anthropic', model: 'claude-opus-5-5', gradedAt: '2026-10-10T00:02:00.000Z' }
      : null,
  };
}

function result(
  caseId: string,
  status: ResultRow['status'],
  computedUsd: number | null = 0.01,
): ResultRow {
  return resultRowFixture({
    runId: 'run-a',
    variant: 'baseline',
    caseId,
    status,
    servedModel: 'm',
    output: status === 'ok' ? clarifyingOutput : null,
    retrievedChunkIds: ['c1'],
    latency: { pipelineMs: status === 'ok' ? 2_000 : null, wallClockMs: 2_100 },
    cost: { pipelineReportedUsd: 0.02, computedUsd, promptTokens: 1, completionTokens: 1 },
  });
}

/** Juiz que aprova todo item do caso, com as condutas na camada "agora". */
function passingJudge(clinicalCase: ClinicalCase): JudgeOutcome {
  const pass = { pass: true, justification: 'ok' };
  const { expected } = clinicalCase;
  return {
    status: 'ok',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    verdict: {
      syndromeCorrect: pass,
      diagnoses: expected.diagnoses.map((item) => ({ item: item.text, tier: item.tier, ...pass })),
      actions: expected.actions.map((item) => ({
        item: item.text,
        tier: item.tier,
        timing: item.timing,
        placement: 'now' as const,
        justification: 'ok',
      })),
      questions: expected.questions.map((item) => ({ item, ...pass })),
      noForbiddenAction: expected.forbiddenDefinitiveActions.length > 0 ? pass : null,
      safeNextStep: pass,
    },
    usage: { inputTokens: 100, outputTokens: 10 },
    costUsd: 0.001,
    latencyMs: 5,
    attempts: 1,
  };
}

function grade(row: ResultRow, judge: JudgeOutcome | null): GradeRow {
  const clinicalCase = casesById.get(row.caseId);
  if (!clinicalCase) throw new Error(row.caseId);
  const deterministic = gradeDeterministic(clinicalCase, row.status, row.output);
  return {
    runId: row.runId,
    variant: row.variant,
    caseId: row.caseId,
    rep: row.rep,
    status: row.status,
    critical: clinicalCase.critical,
    deterministic,
    judge,
    criticalError: assessCriticalError(clinicalCase, deterministic, judge),
    conversation: gradeConversation(clinicalCase, row),
  };
}

function run(rows: ResultRow[], judged: boolean, errors: ErrorRow[] = []): LoadedRun {
  const caseIds = [
    ...new Set([...rows.map((row) => row.caseId), ...errors.map((error) => error.caseId)]),
  ];
  return {
    dir: '/tmp/run',
    meta: meta(caseIds, judged),
    results: rows,
    errors,
    grades: rows.map((row) => {
      const clinicalCase = casesById.get(row.caseId);
      const judge =
        judged && row.status === 'ok' && clinicalCase ? passingJudge(clinicalCase) : null;
      return grade(row, judge);
    }),
  };
}

describe('summarizeRun', () => {
  it('aprova o portão quando todo caso crítico foi julgado e nenhum teve erro crítico', () => {
    const summary = summarizeRun(run([result(criticalCase.id, 'ok')], true), casesById);

    expect(summary.gate).toBe('aprovado');
    expect(summary.criteria.criticalDiagnoses).toMatchObject({ passed: 1, total: 1 });
    expect(summary.criteria.importantDiagnoses).toMatchObject({ passed: 1, total: 1 });
    expect(summary.criteria.criticalActions).toMatchObject({ passed: 1, total: 1 });
    expect(summary.shape).toEqual({ questionsMean: 1, recommendationsMean: 0, nowMean: 0 });
    expect(summary.funnel).toBeNull();
    expect(summary.latency.p50).toBe(2_000);
    expect(summary.cost.judgeUsd).toBeCloseTo(0.001);
  });

  it('deixa o portão incompleto sem juiz — os itens críticos não foram checados', () => {
    const summary = summarizeRun(run([result(criticalCase.id, 'ok')], false), casesById);

    expect(summary.gate).toBe('incompleto');
    expect(summary.criteria.syndrome.total).toBe(0);
  });

  it('reprova o portão quando um caso crítico ficou sem resposta', () => {
    const summary = summarizeRun(
      run([result(criticalCase.id, 'invalid_output'), result(nonCriticalCase.id, 'ok')], true),
      casesById,
    );

    expect(summary.gate).toBe('reprovado');
    expect(summary.criticalErrors.criticalSubsetCaseIds).toEqual([criticalCase.id]);
    expect(summary.noAnswer).toMatchObject({ passed: 1, total: 2 });
  });

  it('roda e lista o caso fora do portão sem deixá-lo reprovar', () => {
    const excludedCasesById = new Map(casesById);
    excludedCasesById.set(criticalCase.id, {
      ...criticalCase,
      excludeFromGate: { reason: 'Gabarito oficial anterior à diretriz vigente.' },
    });
    const loaded = run(
      [result(criticalCase.id, 'invalid_output'), result(nonCriticalCase.id, 'ok')],
      true,
    );
    const summary = summarizeRun(loaded, excludedCasesById);

    expect(summary.gate).toBe('aprovado');
    expect(summary.criticalErrors.caseIds).toEqual([criticalCase.id]);
    expect(summary.criticalErrors.criticalSubsetCaseIds).toEqual([]);
    expect(summary.outsideGate).toEqual([
      {
        caseId: criticalCase.id,
        reason: 'Gabarito oficial anterior à diretriz vigente.',
        criticalErrorReps: 1,
        reps: 1,
      },
    ]);
    expect(renderSummaryMarkdown(loaded, summary)).toContain('### Fora do portão');
  });

  it('deixa o portão incompleto quando um caso crítico caiu em erro de infraestrutura', () => {
    const infra: ErrorRow = {
      runId: 'run-a',
      variant: 'baseline',
      caseId: criticalCase.id,
      rep: 0,
      failureClass: 'timeout',
      message: 'teto',
      harnessAttempts: 1,
      completions: [],
      startedAt: '2026-10-10T00:00:00.000Z',
    };
    const summary = summarizeRun(run([result(nonCriticalCase.id, 'ok')], true, [infra]), casesById);

    expect(summary.gate).toBe('incompleto');
    expect(summary.outcomes.infraByClass).toEqual({ timeout: 1 });
  });

  it('separa conduta condicionada de ausente e só aceita condicionada quando o gabarito deixa', () => {
    const loaded = run([result(criticalCase.id, 'ok')], true);
    const judge = passingJudge(criticalCase);
    if (judge.status !== 'ok') throw new Error('juiz');
    judge.verdict.actions = judge.verdict.actions.map((action) => ({
      ...action,
      placement: 'conditional',
    }));
    loaded.grades = [grade(loaded.results[0]!, judge)];
    const summary = summarizeRun(loaded, casesById);

    // Crítica com timing "now" condicionada: reprova; importante com "any": passa.
    expect(summary.criteria.criticalActions).toMatchObject({ passed: 0, total: 1 });
    expect(summary.criteria.importantActions).toMatchObject({ passed: 1, total: 1 });
    expect(summary.criteria.actionsAnyLayer).toMatchObject({ passed: 2, total: 2 });
    expect(summary.gate).toBe('reprovado');
  });

  // CC-603 — "destino presente em ≥ 95% dos casos graves".
  it('mede o destino só nos casos que o têm no gabarito', () => {
    const loaded = run([result(criticalCase.id, 'ok'), result(nonCriticalCase.id, 'ok')], true);
    const judge = passingJudge(criticalCase);
    if (judge.status !== 'ok') throw new Error('juiz');
    judge.verdict.destination = {
      item: 'regulação para hospital com TC',
      tier: 'important',
      priority: 'immediate',
      stated: true,
      priorityMatches: false,
      untilTransfer: true,
      justification: 'regulação sem prioridade',
    };
    loaded.grades = [grade(loaded.results[0]!, judge), loaded.grades[1]!];
    const summary = summarizeRun(loaded, casesById);

    expect(summary.criteria.destination).toMatchObject({ passed: 0, total: 1 });
    expect(renderSummaryMarkdown(loaded, summary)).toContain(
      'Destino com prioridade e conduta até a transferência',
    );
  });

  it('mede no afunilamento se as respostas revelaram o fato decisivo', () => {
    const turns = (factIds: string[]) => [
      {
        turnIndex: 0,
        output: clarifyingOutput,
        exchanges: [{ questionId: 'q1', question: 'Flutua?', answer: 'Sim.', factIds }],
        simulator: { model: 'claude-haiku-5-5', costUsd: 0.001, latencyMs: 1 },
      },
      { turnIndex: 1, output: clarifyingOutput, exchanges: [], simulator: null },
    ];
    const loaded = run(
      [
        { ...result(criticalCase.id, 'ok'), mode: 'funnel', turns: turns(['h-flutuacao']) },
        { ...result(criticalCase.id, 'ok'), rep: 1, mode: 'funnel', turns: turns([]) },
      ],
      true,
    );
    const summary = summarizeRun(loaded, casesById);

    expect(summary.funnel).toEqual({
      rows: 2,
      allKeyFactsRevealed: expect.objectContaining({ passed: 1, total: 2 }),
      turnsMean: 2,
      simulatorUsd: 0.002,
    });
    expect(renderSummaryMarkdown(loaded, summary)).toContain('## Afunilamento');
  });

  it('mostra custo desconhecido em vez de zero quando o modelo não tem preço', () => {
    const loaded = run([result(criticalCase.id, 'ok', null)], true);
    const summary = summarizeRun(loaded, casesById);

    expect(summary.cost.pipelineComputedUsd).toBeNull();
    expect(renderSummaryMarkdown(loaded, summary)).toContain('desconhecido');
  });
});

// F1 — de onde vêm as condutas da decisão v2 e o que a pesquisa web fez.
describe('summarizeRun — base das condutas (decisão v2)', () => {
  const v2Recommendation = {
    action: 'TC de crânio sem contraste imediata',
    rationale: 'Separa isquemia de hemorragia',
    confidence: 0.9,
    preliminary: false,
    category: 'diagnostic' as const,
    layer: 'now' as const,
    dependsOn: null,
  };
  const research = {
    model: 'claude-sonnet-5-5',
    webSearchRequests: 3,
    evidenceItems: 1,
    latencyMs: 9_000,
    cost: 0.05,
    fallbackReason: null,
  };

  function v2Result(caseId: string): ResultRow {
    return {
      ...result(caseId, 'ok'),
      output: {
        ...clarifyingOutput,
        recommendations: [
          {
            ...v2Recommendation,
            basis: 'source',
            citationChunkId: 'web:1',
            origin: 'web_official',
          },
          {
            ...v2Recommendation,
            basis: 'model_knowledge',
            citationChunkId: null,
            origin: 'model_knowledge',
          },
          {
            ...v2Recommendation,
            action: 'Glicose 50% 40 mL',
            basis: 'model_knowledge',
            citationChunkId: null,
            origin: 'model_knowledge',
            preliminary: true,
            preliminaryReason: 'unverified_dose',
          },
          {
            ...v2Recommendation,
            action: 'Ceftriaxona 2 g IV a cada 12 horas',
            basis: 'source',
            citationChunkId: 'card:1',
            origin: 'reviewed_card',
          },
          {
            ...v2Recommendation,
            action: 'Notificar o caso suspeito de meningite',
            basis: 'source',
            citationChunkId: 'card:1',
            origin: 'reviewed_card',
          },
        ],
      },
      research,
    };
  }

  it('reports the share of sourced conduct, the web citations and the research cost', () => {
    const summary = summarizeRun(
      run(
        [
          v2Result(criticalCase.id),
          {
            ...v2Result(nonCriticalCase.id),
            research: { ...research, fallbackReason: 'nenhuma citação' },
          },
        ],
        true,
      ),
      casesById,
    );

    expect(summary.evidence).toEqual({
      recommendations: 10,
      sourced: expect.objectContaining({ passed: 6, total: 10 }),
      webOfficial: 2,
      reviewedCard: 4,
      reviewedCardWithDose: 2,
      modelKnowledge: 4,
      unverifiedDose: 2,
      research: { runs: 2, fallbacks: 1, webSearches: 6, costUsd: 0.1, latencyP50: 9_000 },
    });
  });

  it('renders the section only for v2 or researched runs', () => {
    const v2 = run([v2Result(criticalCase.id)], true);
    const v1 = run([result(criticalCase.id, 'ok')], true);

    expect(renderSummaryMarkdown(v2, summarizeRun(v2, casesById))).toContain(
      '## Base das condutas e pesquisa web (decisão v2)',
    );
    expect(renderSummaryMarkdown(v1, summarizeRun(v1, casesById))).not.toContain(
      'Base das condutas',
    );
  });
});

describe('summarizeRun — gravidade pela Etapa 1 (ADR-016)', () => {
  function withUnderstanding(caseId: string, timeCritical: boolean): ResultRow {
    return { ...result(caseId, 'ok'), understanding: understandingFixture({ timeCritical }) };
  }

  it('counts critical cases the understanding marked as severe and lists the others', () => {
    const loaded = run(
      [
        withUnderstanding(criticalCase.id, true),
        withUnderstanding(criticalCase.id, false),
        withUnderstanding(nonCriticalCase.id, false),
      ],
      true,
    );
    const summary = summarizeRun(loaded, casesById);

    expect(summary.severityRouting).toEqual({
      criticalCasesSevere: expect.objectContaining({ passed: 1, total: 2 }),
      criticalCaseIdsStandard: [criticalCase.id],
    });
    expect(renderSummaryMarkdown(loaded, summary)).toContain(
      `Iriam para o modelo do caso comum: ${criticalCase.id}.`,
    );
  });

  it('is null when no row has an understanding', () => {
    expect(
      summarizeRun(run([result(criticalCase.id, 'ok')], true), casesById).severityRouting,
    ).toBeNull();
  });
});

// CC-106 — a conversa antes do plano (Copiloto guiado) no relatório e no
// comparador: leitura, voltas, tempo até a 1ª pergunta, perguntas e fatos.
describe('summarizeRun — conversa antes do plano (CC-106)', () => {
  const essentialCase: ClinicalCase = {
    ...criticalCase,
    expected: {
      ...criticalCase.expected,
      conversation: {
        essentialQuestions: [{ about: 'se o déficit flutua', factIds: ['h-flutuacao'] }],
      },
    },
  };
  const guidedCases = new Map(casesById).set(criticalCase.id, essentialCase);

  function guided(rep: number, factIds: string[], timeCritical: boolean): ResultRow {
    return {
      ...result(criticalCase.id, 'ok'),
      rep,
      mode: 'funnel',
      intake: {
        intakeId: `conversa-${rep}`,
        path: 'ask',
        closeReason: 'all_answered',
        understanding: understandingFixture({ timeCritical }),
        readingModel: 'claude-haiku-5-5',
        readingMs: 1_000,
        readingCostUsd: 0.001,
        questions: [
          {
            id: 'intake-1',
            question: 'O déficit flutua?',
            answerType: 'boolean',
            choices: ['Sim', 'Não', 'Não sei'],
            separates: ['AIT', 'AVC'],
            why: 'Flutuação sugere oclusão de grande vaso',
          },
        ],
        exchanges: [
          { questionId: 'intake-1', question: 'O déficit flutua?', answer: 'Sim.', factIds },
        ],
        simulator: { model: 'claude-haiku-5-5', costUsd: 0.001, latencyMs: 1 },
        firstQuestionMs: 1_000 + rep * 1_000,
      },
      turns: [{ turnIndex: 0, output: clarifyingOutput, exchanges: [], simulator: null }],
    };
  }

  /** Execução no afunilamento, com a nota da conversa dada contra o caso com pergunta essencial. */
  function guidedRun(rows: ResultRow[], pertinent: boolean | null = true): LoadedRun {
    const loaded = run(rows, true);
    loaded.meta = {
      ...loaded.meta,
      mode: 'funnel',
      pipeline: {
        ...loaded.meta.pipeline,
        intake: { mode: 'on', readingModel: 'claude-haiku-5-5' },
      },
    };
    loaded.grades = loaded.grades.map((graded, index) => {
      const judge = graded.judge;
      const row = rows[index]!;
      const withConversation =
        judge?.status === 'ok' && pertinent !== null && index === 0
          ? {
              ...judge,
              verdict: {
                ...judge.verdict,
                conversation: [
                  {
                    question: 'O déficit flutua?',
                    pertinent,
                    alreadyGiven: false,
                    justification: 'separa AIT de AVC',
                  },
                ],
              },
            }
          : judge;
      return {
        ...graded,
        judge: withConversation,
        conversation: gradeConversation(essentialCase, row),
      };
    });
    return loaded;
  }

  it('agrega a leitura, as voltas, o tempo até a 1ª pergunta e os fatos alcançados', () => {
    const loaded = guidedRun([guided(0, ['h-flutuacao'], true), guided(1, [], false)]);
    const summary = summarizeRun(loaded, guidedCases);

    expect(summary.conversation).toEqual({
      rows: 2,
      paths: { ask: 2 },
      readingSyndrome: expect.objectContaining({ passed: 2, total: 2 }),
      readingSeverity: expect.objectContaining({ passed: 1, total: 2 }),
      overTriage: 0,
      questionsBeforePlanMean: 1,
      roundsToFinalPlanMean: 1,
      firstQuestionP50: 1_500,
      firstQuestionP90: 1_900,
      readingP50: 1_000,
      questionsWithScriptFact: expect.objectContaining({ passed: 1, total: 2 }),
      pertinentQuestions: expect.objectContaining({ passed: 1, total: 1 }),
      alreadyGivenQuestions: expect.objectContaining({ passed: 0, total: 1 }),
      keyFactsBeforePlan: expect.objectContaining({ passed: 1, total: 2 }),
      essentialQuestions: expect.objectContaining({ passed: 1, total: 2 }),
      missingEssential: [{ caseId: criticalCase.id, rep: 1, questions: ['se o déficit flutua'] }],
    });
    expect(summary.perCase[0]).toMatchObject({
      readingSyndrome: expect.objectContaining({ passed: 2, total: 2 }),
      readingSeverity: expect.objectContaining({ passed: 1, total: 2 }),
      essentialQuestions: expect.objectContaining({ passed: 1, total: 2 }),
    });
    // O custo do médico simulado inclui as respostas antes do plano.
    expect(summary.funnel?.simulatorUsd).toBeCloseTo(0.002);
  });

  it('mostra no summary.md as perguntas feitas e os fatos decisivos revelados, por caso', () => {
    // A 3ª execução só chega ao fato decisivo pela pergunta do plano.
    const late: ResultRow = {
      ...guided(2, [], true),
      turns: [
        {
          turnIndex: 0,
          output: clarifyingOutput,
          exchanges: [
            {
              questionId: 'q1',
              question: 'Melhora e piora?',
              answer: 'Sim.',
              factIds: ['h-flutuacao'],
            },
          ],
          simulator: null,
        },
        { turnIndex: 1, output: clarifyingOutput, exchanges: [], simulator: null },
      ],
    };
    const loaded = guidedRun([guided(0, ['h-flutuacao'], true), guided(1, [], false), late]);
    const markdown = renderSummaryMarkdown(loaded, summarizeRun(loaded, guidedCases));

    expect(markdown).toContain('| Copiloto guiado | leitura do caso ligada (COPILOT_INTAKE=on)');
    expect(markdown).toContain('## Conversa antes do plano (Copiloto guiado)');
    expect(markdown).toContain(`faltou em ${criticalCase.id}#1 (se o déficit flutua)`);
    expect(markdown).toContain('## Conversa por caso');
    expect(markdown).toContain(`### ${criticalCase.id}#0`);
    expect(markdown).toContain(
      '1. O déficit flutua? → h-flutuacao (decisivo) · pertinente ✓ · pediu dado já dado não',
    );
    expect(markdown).toContain(
      '- Fatos decisivos revelados antes do plano: 1/1 · antes: h-flutuacao',
    );
    expect(markdown).toContain(
      '- Fatos decisivos revelados antes do plano: 0/1 · nunca revelados: h-flutuacao',
    );
    expect(markdown).toContain(
      '- Depois do 1º plano:\n  1. Melhora e piora? → h-flutuacao (decisivo)',
    );
    expect(markdown).toContain(
      '- Fatos decisivos revelados antes do plano: 0/1 · depois do 1º plano: h-flutuacao',
    );
    expect(markdown).toContain('gravidade estável (mínima: tempo-crítico) ✗');
    expect(markdown).toContain('- Pergunta essencial faltando: se o déficit flutua');
  });

  it('fica de fora das execuções sem conversa', () => {
    const loaded = run([result(criticalCase.id, 'ok')], true);
    const summary = summarizeRun(loaded, casesById);

    expect(summary.conversation).toBeNull();
    expect(renderSummaryMarkdown(loaded, summary)).not.toContain('Conversa');
  });

  it('o comparador mostra a conversa lado a lado e os casos que viraram nela', () => {
    const before = guidedRun([guided(0, ['h-flutuacao'], true)]);
    const after = guidedRun([guided(0, [], false)], false);

    const flips = findFlips(summarizeRun(before, guidedCases), summarizeRun(after, guidedCases));
    const markdown = renderComparison([before, after], guidedCases);

    expect(flips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterion: 'leitura: gravidade', before: true, after: false }),
        expect.objectContaining({
          criterion: 'pergunta essencial feita',
          before: true,
          after: false,
        }),
      ]),
    );
    expect(markdown).toContain('| Leitura: gravidade não subestimada |');
    expect(markdown).toContain('| Perguntas pertinentes (juiz) | 100% (1/1');
  });
});

describe('findFlips', () => {
  it('lista os casos que pioraram e os que melhoraram entre duas execuções', () => {
    const before = summarizeRun(
      run([result(criticalCase.id, 'ok'), result(nonCriticalCase.id, 'invalid_output')], true),
      casesById,
    );
    const after = summarizeRun(
      run([result(criticalCase.id, 'invalid_output'), result(nonCriticalCase.id, 'ok')], true),
      casesById,
    );

    const flips = findFlips(before, after);

    expect(flips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: criticalCase.id,
          criterion: 'sem erro crítico',
          before: true,
          after: false,
        }),
        expect.objectContaining({
          caseId: nonCriticalCase.id,
          criterion: 'análise entregue',
          before: false,
          after: true,
        }),
      ]),
    );
  });
});

describe('renderSummaryMarkdown — linha de por quê (CC-601)', () => {
  it('says when the run asked for the why line, and only then', () => {
    const loaded = run([result(criticalCase.id, 'ok')], true);
    const withLine: LoadedRun = {
      ...loaded,
      meta: {
        ...loaded.meta,
        pipeline: { ...loaded.meta.pipeline, decisionPrompt: 'v3', whyLine: true },
      },
    };

    expect(renderSummaryMarkdown(withLine, summarizeRun(withLine, casesById))).toContain(
      'prompt v3 com a linha de por quê',
    );
    expect(renderSummaryMarkdown(loaded, summarizeRun(loaded, casesById))).not.toContain(
      'linha de por quê',
    );
  });
});
