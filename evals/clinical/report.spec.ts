import { describe, expect, it } from 'vitest';
import type { CopilotOutput } from '../../src/modules/copilot/guardrails/output-validator';
import type { ClinicalCase } from './case.schema';
import { understandingFixture } from '../../tests/fixtures/case-understanding';
import { resultRowFixture, strokeCaseFixture } from './case-fixture';
import { findFlips } from './compare';
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
      decisionModel: null,
      decisionCriticalModel: null,
      research: null,
      structuredOutput: true,
      refusalFallback: false,
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
      recommendations: 6,
      sourced: expect.objectContaining({ passed: 2, total: 6 }),
      webOfficial: 2,
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
