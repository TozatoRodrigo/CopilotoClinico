import { describe, expect, it } from 'vitest';
import { understandingFixture } from '../../tests/fixtures/case-understanding';
import { loadCaseSet } from './cases';
import { gradeDeterministic } from './graders/deterministic';
import { GradeRowSchema, ResultRowSchema, RunMetaSchema } from './records';

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

  // F1 — a nota é dada na releitura: o que decide "conduta definitiva" não
  // pode ser descartado pelo zod. Antes, `preliminaryReason` sumia e a regra
  // de fonte não revisada (F0-C) nunca rodava ao dar as notas.
  describe('recomendações enriquecidas', () => {
    const alteplase = {
      action: 'Administrar alteplase 0,9 mg/kg IV',
      rationale: 'AVC isquêmico na janela',
      confidence: 0.8,
      category: 'therapeutic',
      source: 'Diretriz',
      sourceVersion: '1',
      sourceText: 'trecho',
      sourceUrl: '',
    };
    const reread = (recommendations: Array<Record<string, unknown>>) =>
      ResultRowSchema.parse(
        JSON.parse(JSON.stringify({ ...row, output: { ...row.output, recommendations } })),
      );
    const strokeWithoutCt = loadCaseSet().cases.find(
      (clinicalCase) => clinicalCase.id === 'cm-avc-sem-tc',
    )!;

    it('keeps the layer, basis, origin and preliminary reason of the v2 decision', () => {
      const parsed = reread([
        {
          ...alteplase,
          citationChunkId: 'web:1',
          preliminary: true,
          preliminaryReason: 'depends_on_data',
          layer: 'depends',
          dependsOn: 'TC sem sangramento',
          basis: 'source',
          origin: 'web_official',
        },
      ]);

      expect(parsed.output?.recommendations[0]).toMatchObject({
        layer: 'depends',
        dependsOn: 'TC sem sangramento',
        basis: 'source',
        origin: 'web_official',
        preliminaryReason: 'depends_on_data',
      });
      expect(gradeDeterministic(strokeWithoutCt, 'ok', parsed.output).forbiddenMatches).toEqual([]);
    });

    it('keeps model knowledge without a citation id', () => {
      const parsed = reread([
        { ...alteplase, citationChunkId: null, preliminary: false, basis: 'model_knowledge' },
      ]);

      expect(parsed.output?.recommendations[0]?.citationChunkId).toBeNull();
    });

    it('still flags a forbidden action marked preliminary only by an unreviewed source', () => {
      const parsed = reread([
        {
          ...alteplase,
          citationChunkId: 'chunk-1',
          preliminary: true,
          preliminaryReason: 'unreviewed_source',
          origin: 'curated_unsigned',
        },
      ]);

      expect(
        gradeDeterministic(strokeWithoutCt, 'ok', parsed.output).forbiddenMatches,
      ).toHaveLength(1);
    });
  });

  it('keeps the web evidence and the research trace of the row', () => {
    const webEvidence = [
      {
        id: 'web:1',
        url: 'https://www.gov.br/saude/avc',
        title: 'Linha de cuidado do AVC',
        domain: 'gov.br',
        citedText: 'TC imediata.',
      },
    ];
    const research = {
      model: 'claude-sonnet-5-5',
      webSearchRequests: 3,
      evidenceItems: 1,
      latencyMs: 9000,
      cost: 0.05,
      fallbackReason: null,
    };

    const parsed = ResultRowSchema.parse({ ...row, webEvidence, research });

    expect(parsed.webEvidence).toEqual(webEvidence);
    expect(parsed.research).toEqual(research);
    expect(ResultRowSchema.parse(row)).toMatchObject({ webEvidence: null, research: null });
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
      decisionPrompt: 'v1',
      knowledgeSource: 'internal_kb',
      research: null,
      intake: null,
    });
  });
});

// CC-106 — a conversa antes do plano entrou nos arquivos da execução sem
// tornar ilegíveis os que foram gravados antes: `--regrade --reuse-judge`
// relê execuções antigas.
describe('conversa antes do plano nos arquivos da execução', () => {
  it('lê como sem conversa a linha gravada antes do CC-106', () => {
    expect(ResultRowSchema.parse({ ...row, mode: 'funnel', turns: [] }).intake).toBeNull();
  });

  it('guarda a conversa na releitura do results.jsonl', () => {
    const intake = {
      intakeId: 'conversa-1',
      path: 'ask',
      closeReason: 'urgent_answer',
      understanding: understandingFixture(),
      readingModel: 'claude-haiku-5-5',
      readingMs: 1_500,
      readingCostUsd: 0.002,
      questions: [
        {
          id: 'intake-1',
          question: 'O déficit flutua?',
          answerType: 'boolean',
          choices: ['Sim', 'Não', 'Não sei'],
          separates: ['AIT', 'AVC'],
          why: 'Separa AIT de AVC',
        },
      ],
      exchanges: [
        { questionId: 'intake-1', question: 'O déficit flutua?', answer: 'Sim.', factIds: ['h-1'] },
      ],
      simulator: { model: 'claude-haiku-5-5', costUsd: 0.001, latencyMs: 5 },
      firstQuestionMs: 1_700,
    };

    const parsed = ResultRowSchema.parse(JSON.parse(JSON.stringify({ ...row, intake })));

    expect(parsed.intake).toEqual(intake);
  });

  it('lê como sem nota de conversa a nota gravada antes do CC-106', () => {
    const grade = GradeRowSchema.parse({
      runId: 'run',
      variant: 'v',
      caseId: 'cm-avc-sem-tc',
      rep: 0,
      status: 'ok',
      critical: true,
      deterministic: { noAnswer: false, shape: null, forbiddenMatches: [] },
      judge: null,
      criticalError: { value: false, complete: true, reasons: [] },
    });

    expect(grade.conversation).toBeNull();
  });
});
