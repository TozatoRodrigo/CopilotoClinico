import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClinicalCase } from './case.schema';
import { strokeCaseFixture } from './case-fixture';
import { gradeResult } from './grading';
import { RUN_FILES } from './records';
import { loadRun, renderSummaryMarkdown, summarizeRun } from './report';

/**
 * CC-106 — `--regrade --reuse-judge` relê uma execução gravada antes da
 * conversa do Copiloto guiado: results.jsonl sem `intake`, grades.jsonl sem
 * `conversation` e veredito do juiz sem a parte da conversa. Os arquivos
 * abaixo estão no formato em que as execuções de 11/10/2026 foram gravadas.
 */

const clinicalCase = strokeCaseFixture();
const casesById = new Map<string, ClinicalCase>([[clinicalCase.id, clinicalCase]]);

const output = {
  reasoning: 'Déficit que flutua: isquemia.',
  redFlags: [],
  recommendations: [],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
  clarifyingQuestions: [],
};

const oldMeta = {
  runId: 'run-antiga',
  variant: { name: 'claude-opus-5-5', description: 'Opus 5.5', env: {} },
  startedAt: '2026-10-11T00:00:00.000Z',
  finishedAt: '2026-10-11T01:00:00.000Z',
  git: { commit: 'abc', dirty: false },
  caseSet: { set: 'main', version: 'v2', selector: null, caseIds: [clinicalCase.id] },
  reps: 1,
  mode: 'funnel',
  concurrency: 1,
  caseTimeoutMs: 900_000,
  database: 'u@localhost:5432/db',
  pipeline: {
    completionProvider: 'anthropic',
    embeddingProvider: 'openai',
    requestedModel: 'claude-opus-5-5',
    embeddingModel: 'text-embedding-3-small',
    maxOutputTokens: 32_000,
    effort: 'high',
    structuredOutput: true,
    refusalFallback: true,
  },
  knowledgeBase: { approvedChunks: 10, approvedChunksWithEmbedding: 10, officialChunks: 0 },
  judge: { provider: 'anthropic', model: 'claude-opus-5-5', gradedAt: '2026-10-11T02:00:00.000Z' },
};

const oldResult = {
  runId: 'run-antiga',
  variant: 'claude-opus-5-5',
  caseId: clinicalCase.id,
  rep: 0,
  status: 'ok',
  mode: 'funnel',
  turns: [
    {
      turnIndex: 0,
      output,
      exchanges: [
        {
          questionId: 'q1',
          question: 'Flutua?',
          answer: 'Melhora e piora.',
          factIds: ['h-flutuacao'],
        },
      ],
      simulator: { model: 'claude-haiku-5-5', costUsd: 0.001, latencyMs: 5 },
    },
    { turnIndex: 1, output, exchanges: [], simulator: null },
  ],
  harnessAttempts: 1,
  servedModel: 'claude-opus-5-5',
  servedByFallback: false,
  encounterId: 'enc',
  interactionId: 'int',
  output,
  citations: [],
  metadata: null,
  retrievedChunkIds: [],
  validationErrors: [],
  rawContent: null,
  completions: [],
  latency: { pipelineMs: 1_000, wallClockMs: 2_000 },
  cost: { pipelineReportedUsd: 0.1, computedUsd: 0.1, promptTokens: 1, completionTokens: 1 },
  startedAt: '2026-10-11T00:00:00.000Z',
};

const pass = { pass: true, justification: 'ok' };
const oldGrade = {
  runId: 'run-antiga',
  variant: 'claude-opus-5-5',
  caseId: clinicalCase.id,
  rep: 0,
  status: 'ok',
  critical: true,
  deterministic: { noAnswer: false, shape: null, forbiddenMatches: [] },
  judge: {
    status: 'ok',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    verdict: {
      syndromeCorrect: pass,
      diagnoses: clinicalCase.expected.diagnoses.map((item) => ({
        item: item.text,
        tier: item.tier,
        ...pass,
      })),
      actions: clinicalCase.expected.actions.map((item) => ({
        item: item.text,
        tier: item.tier,
        timing: item.timing,
        placement: 'now',
        justification: 'ok',
      })),
      questions: clinicalCase.expected.questions.map((item) => ({ item, ...pass })),
      noForbiddenAction: pass,
      safeNextStep: pass,
    },
    usage: { inputTokens: 10, outputTokens: 10 },
    costUsd: 0.01,
    latencyMs: 10,
    attempts: 1,
  },
  criticalError: { value: false, complete: true, reasons: [] },
};

describe('--regrade --reuse-judge numa execução anterior ao CC-106', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('relê os arquivos, refaz a nota sem chamar o juiz e gera o relatório sem a conversa', async () => {
    dir = mkdtempSync(join(tmpdir(), 'gabarito-antigo-'));
    writeFileSync(join(dir, RUN_FILES.meta), JSON.stringify(oldMeta));
    writeFileSync(join(dir, RUN_FILES.results), `${JSON.stringify(oldResult)}\n`);
    writeFileSync(join(dir, RUN_FILES.grades), `${JSON.stringify(oldGrade)}\n`);

    const old = loadRun(dir);
    const [row] = old.results;
    const [previous] = old.grades;
    if (!row || !previous) throw new Error('execução antiga sem linha');
    // O que gradeRun faz com --reuse-judge: o veredito gravado, sem chamar o juiz.
    const regraded = await gradeResult(row, clinicalCase, null, undefined, previous.judge);
    const summary = summarizeRun({ ...old, grades: [regraded] }, casesById);
    const markdown = renderSummaryMarkdown({ ...old, grades: [regraded] }, summary);

    expect(row.intake).toBeNull();
    expect(old.meta.pipeline.intake).toBeNull();
    expect(regraded.judge).toEqual(previous.judge);
    expect(regraded.conversation).toBeNull();
    expect(summary.gate).toBe('aprovado');
    expect(summary.conversation).toBeNull();
    expect(summary.funnel?.allKeyFactsRevealed).toMatchObject({ passed: 1, total: 1 });
    expect(markdown).toContain('## Afunilamento');
    expect(markdown).not.toContain('Conversa antes do plano');
  });
});
