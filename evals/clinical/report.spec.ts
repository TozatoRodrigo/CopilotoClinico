import { describe, expect, it } from 'vitest';
import type { CopilotOutput } from '../../src/modules/copilot/guardrails/output-validator';
import { loadCaseSet } from './cases';
import { findFlips } from './compare';
import { gradeDeterministic } from './graders/deterministic';
import type { JudgeOutcome } from './graders/judge';
import { assessCriticalError } from './grading';
import type { ErrorRow, GradeRow, ResultRow, RunMeta } from './records';
import { renderSummaryMarkdown, summarizeRun, type LoadedRun } from './report';

const { cases } = loadCaseSet();
const casesById = new Map(cases.map((clinicalCase) => [clinicalCase.id, clinicalCase]));
const criticalCase = casesById.get('kb001-cf-001');
const nonCriticalCase = casesById.get('kb001-sg-001');
if (!criticalCase || !nonCriticalCase) throw new Error('casos de teste ausentes');

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
    caseSet: { version: 'v1', selector: null, caseIds },
    reps: 1,
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
  return {
    runId: 'run-a',
    variant: 'baseline',
    caseId,
    rep: 0,
    status,
    harnessAttempts: 1,
    servedByFallback: false,
    servedModel: 'm',
    encounterId: 'enc',
    interactionId: 'int',
    output: status === 'ok' ? clarifyingOutput : null,
    understanding: null,
    webEvidence: null,
    research: null,
    citations: [],
    metadata: null,
    retrievedChunkIds: ['c1'],
    validationErrors: [],
    rawContent: null,
    completions: [],
    latency: { pipelineMs: status === 'ok' ? 2_000 : null, wallClockMs: 2_100 },
    cost: { pipelineReportedUsd: 0.02, computedUsd, promptTokens: 1, completionTokens: 1 },
    startedAt: '2026-10-10T00:00:00.000Z',
  };
}

function passingJudge(cannotMissCount: number, mustRequestCount: number): JudgeOutcome {
  const pass = { pass: true, justification: 'ok' };
  return {
    status: 'ok',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    verdict: {
      syndromeCorrect: pass,
      cannotMiss: Array.from({ length: cannotMissCount }, (_unused, index) => ({
        item: `cm${index}`,
        ...pass,
      })),
      mustRequest: Array.from({ length: mustRequestCount }, (_unused, index) => ({
        item: `mr${index}`,
        ...pass,
      })),
      requiredActionsPresent: null,
      noForbiddenAction: null,
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
        judged && row.status === 'ok' && clinicalCase
          ? passingJudge(
              clinicalCase.expected.cannotMiss.length,
              clinicalCase.expected.mustRequest.length,
            )
          : null;
      return grade(row, judge);
    }),
  };
}

describe('summarizeRun', () => {
  it('aprova o portão quando todo caso crítico foi julgado e nenhum teve erro crítico', () => {
    const summary = summarizeRun(run([result(criticalCase.id, 'ok')], true), casesById);

    expect(summary.gate).toBe('aprovado');
    expect(summary.criteria.path).toMatchObject({ passed: 1, total: 1 });
    expect(summary.criteria.cannotMissItems.total).toBe(criticalCase.expected.cannotMiss.length);
    expect(summary.latency.p50).toBe(2_000);
    expect(summary.cost.judgeUsd).toBeCloseTo(0.001);
  });

  it('deixa o portão incompleto sem juiz — "não pode faltar" não foi checado', () => {
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
