import { describe, expect, it } from 'vitest';
import { understandingFixture } from '../../tests/fixtures/case-understanding';
import { ResultRowSchema, RunMetaSchema } from './records';

/**
 * F1 — results.jsonl é relido para dar as notas: o entendimento do caso
 * precisa sobreviver à releitura, e execuções anteriores à Fase 1 continuam
 * legíveis.
 */

const row = {
  runId: 'run',
  variant: 'claude-opus-5-5-stages',
  caseId: 'cm-avc-sem-tc',
  rep: 0,
  status: 'ok',
  harnessAttempts: 1,
  servedModel: 'claude-opus-5-5',
  servedByFallback: false,
  encounterId: 'enc',
  interactionId: 'int',
  output: {
    reasoning: 'Déficit focal súbito.',
    redFlags: [],
    recommendations: [],
    uncertainty: true,
    uncertaintyReason: 'Sem diretriz',
    differentials: [],
    clarifyingQuestions: [],
  },
  citations: [],
  metadata: null,
  retrievedChunkIds: [],
  validationErrors: [],
  rawContent: null,
  completions: [],
  latency: { pipelineMs: 1, wallClockMs: 1 },
  cost: { pipelineReportedUsd: 0, computedUsd: 0, promptTokens: 0, completionTokens: 0 },
  startedAt: '2026-10-10T00:00:00.000Z',
};

describe('ResultRowSchema', () => {
  it('keeps the understanding when results.jsonl is read back', () => {
    const understanding = understandingFixture();

    const parsed = ResultRowSchema.parse(JSON.parse(JSON.stringify({ ...row, understanding })));

    expect(parsed.understanding).toEqual(understanding);
  });

  it('reads rows written before Phase 1 as having no understanding', () => {
    expect(ResultRowSchema.parse(row).understanding).toBeNull();
  });
});

describe('RunMetaSchema', () => {
  it('reads run.json written before Phase 1 as a legacy run', () => {
    const meta = RunMetaSchema.parse({
      runId: 'run',
      variant: { name: 'baseline', description: 'Produção', env: {} },
      startedAt: '2026-10-10T00:00:00.000Z',
      finishedAt: null,
      git: { commit: null, dirty: null },
      caseSet: { version: 'v1', selector: null, caseIds: [] },
      reps: 1,
      concurrency: 1,
      caseTimeoutMs: 1_000,
      database: 'u@localhost:5432/db',
      pipeline: {
        completionProvider: 'openai',
        embeddingProvider: 'openai',
        requestedModel: 'gpt-5.6-luna',
        embeddingModel: 'text-embedding-3-small',
        maxOutputTokens: 16_000,
        effort: 'high',
        structuredOutput: true,
        refusalFallback: false,
      },
      knowledgeBase: { approvedChunks: 0, approvedChunksWithEmbedding: 0, officialChunks: 0 },
      judge: null,
    });

    expect(meta.pipeline).toMatchObject({
      reasoning: 'legacy',
      understandingModel: null,
      understandingEffort: null,
    });
  });
});
