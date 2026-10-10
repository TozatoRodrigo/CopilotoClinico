import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/config/prisma.service';
import type {
  OrchestratorResult,
  OrchestratorService,
} from '../../src/modules/copilot/orchestrator/orchestrator.service';
import type { EncountersService } from '../../src/modules/encounters/encounters.service';
import { loadCaseSet } from './cases';
import { classifyInfraError, runCase, type PipelineServices } from './pipeline';
import { CompletionRecorder, type RecordedCompletion } from './recorder';

const { cases } = loadCaseSet();
const clinicalCase = cases.find((candidate) => candidate.id === 'kb001-cf-002');
if (!clinicalCase) throw new Error('caso kb001-cf-002 ausente');

const key = { runId: 'run', variant: 'teste', rep: 0 };
const fastRetry = {
  caseTimeoutMs: 1_000,
  retryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
};

function completion(overrides: Partial<RecordedCompletion> = {}): RecordedCompletion {
  return {
    messages: [{ role: 'user', content: 'caso' }],
    requestedModel: 'claude-opus-5-5',
    servedModel: 'claude-opus-5-5',
    content: '{}',
    stopReason: 'end_turn',
    usage: { promptTokens: 1_000_000, completionTokens: 100_000, totalTokens: 1_100_000 },
    latencyMs: 10,
    error: null,
    ...overrides,
  };
}

const analysis: OrchestratorResult = {
  interactionId: 'interacao-1',
  output: {
    reasoning: 'Cefaleia em trovoada com déficit: hemorragia até prova em contrário.',
    redFlags: [],
    recommendations: [],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [
      {
        id: 'q1',
        question: 'Usa anticoagulante?',
        why: 'Muda a conduta',
        criticality: 'important',
        expectedAnswerType: 'boolean',
      },
    ],
  },
  citations: [],
  metadata: {
    piiDetected: false,
    injectionDetected: false,
    chunksRetrieved: 2,
    retrievalCoverage: 'full',
    officialChunksRetrieved: 0,
    latencyMs: 1_234,
    cost: 0.5,
    model: 'claude-opus-5-5',
    turnIndex: 0,
    maxTurns: 5,
  },
};

/**
 * Simula o pipeline: cada chamada de `analyze` executa o próximo roteiro,
 * que grava completions no recorder (como o RecordingAiGatewayService faz).
 */
function servicesWith(
  scripts: Array<(recorder: CompletionRecorder) => Promise<OrchestratorResult>>,
) {
  const recorder = new CompletionRecorder();
  const analyze = vi.fn(() => {
    const script = scripts.shift();
    if (!script) throw new Error('sem roteiro');
    return script(recorder);
  });
  const services: PipelineServices = {
    orchestrator: { analyze } as unknown as OrchestratorService,
    encounters: {
      create: vi.fn().mockResolvedValue({ id: 'atendimento-1' }),
    } as unknown as EncountersService,
    prisma: {
      aiInteraction: {
        findUnique: vi.fn().mockResolvedValue({ retrievedChunkIds: ['c1', 'c2'] }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'interacao-falha',
          retrievedChunkIds: ['c1'],
          rawOutput: {
            raw: '{"reasoning": "corta',
            validationErrors: ['Output is not valid JSON'],
          },
        }),
      },
    } as unknown as PrismaService,
    recorder,
    physicianId: 'medico-1',
  };
  return { services, analyze };
}

function validationFailure(stopReason: string) {
  return async (recorder: CompletionRecorder): Promise<OrchestratorResult> => {
    recorder.record(completion({ stopReason }));
    recorder.record(completion({ stopReason }));
    throw new BadRequestException({
      message: 'AI output validation failed',
      errors: ['Output is not valid JSON'],
    });
  };
}

describe('runCase', () => {
  it('grava a análise entregue com o rastro completo e o custo calculado pelo modelo servido', async () => {
    const { services } = servicesWith([
      async (recorder) => {
        recorder.record(completion());
        return analysis;
      },
    ]);

    const outcome = await runCase(services, clinicalCase, key, fastRetry);

    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    expect(outcome.row).toMatchObject({
      status: 'ok',
      servedModel: 'claude-opus-5-5',
      interactionId: 'interacao-1',
      retrievedChunkIds: ['c1', 'c2'],
      harnessAttempts: 1,
      latency: { pipelineMs: 1_234 },
      cost: { pipelineReportedUsd: 0.5, promptTokens: 1_000_000, completionTokens: 100_000 },
    });
    expect(outcome.row.cost.computedUsd).toBeCloseTo(4 + 2);
    expect(outcome.row.completions).toHaveLength(1);
  });

  it.each([
    ['end_turn', 'invalid_output'],
    ['max_tokens', 'truncated'],
    ['refusal', 'refusal'],
  ])(
    'trata "AI output validation failed" com stop %s como desfecho %s (sem resposta, pontuado)',
    async (stopReason, status) => {
      const { services } = servicesWith([validationFailure(stopReason)]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome.kind).toBe('result');
      if (outcome.kind !== 'result') return;
      expect(outcome.row).toMatchObject({
        status,
        output: null,
        interactionId: 'interacao-falha',
        validationErrors: ['Output is not valid JSON'],
        rawContent: '{"reasoning": "corta',
        retrievedChunkIds: ['c1'],
      });
      expect(outcome.row.completions).toHaveLength(2);
    },
  );

  it('repete erro transitório do provedor e registra as tentativas', async () => {
    const { services, analyze } = servicesWith([
      async () => {
        throw new Error('AI provider error: 429');
      },
      async () => {
        throw new Error('AI provider error: 503');
      },
      async (recorder) => {
        recorder.record(completion());
        return analysis;
      },
    ]);

    const outcome = await runCase(services, clinicalCase, key, fastRetry);

    expect(analyze).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({ kind: 'result', row: { status: 'ok', harnessAttempts: 3 } });
  });

  it('não repete erro 4xx e o grava como infraestrutura, fora da nota', async () => {
    const { services, analyze } = servicesWith([
      async () => {
        throw new Error('AI provider error: 400');
      },
    ]);

    const outcome = await runCase(services, clinicalCase, key, fastRetry);

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      kind: 'error',
      row: { failureClass: 'provider_rejected', harnessAttempts: 1 },
    });
  });

  it('separa o bloqueio do filtro de injeção', async () => {
    const { services } = servicesWith([
      async () => {
        throw new BadRequestException({
          message: 'Input contains potentially unsafe content',
          reasons: ['ROLE_MANIPULATION_ATTEMPT'],
        });
      },
    ]);

    const outcome = await runCase(services, clinicalCase, key, fastRetry);

    expect(outcome).toMatchObject({
      kind: 'error',
      row: {
        failureClass: 'input_rejected',
        message: expect.stringContaining('ROLE_MANIPULATION_ATTEMPT'),
      },
    });
  });

  it('descarta a execução servida por outro modelo', async () => {
    const { services } = servicesWith([
      async (recorder) => {
        recorder.record(completion({ servedModel: 'claude-haiku-5-5' }));
        return analysis;
      },
    ]);

    const outcome = await runCase(services, clinicalCase, key, fastRetry);

    expect(outcome).toMatchObject({
      kind: 'error',
      row: { failureClass: 'served_model_mismatch' },
    });
  });

  it('aplica o teto de tempo por caso e guarda o que já foi gravado', async () => {
    const { services } = servicesWith([
      (recorder) => {
        recorder.record(completion());
        return new Promise<OrchestratorResult>(() => undefined);
      },
    ]);

    const outcome = await runCase(services, clinicalCase, key, { ...fastRetry, caseTimeoutMs: 20 });

    expect(outcome).toMatchObject({ kind: 'error', row: { failureClass: 'timeout' } });
    if (outcome.kind === 'error') expect(outcome.row.completions).toHaveLength(1);
  });
});

describe('classifyInfraError', () => {
  it('classifica rede, banco e provedor', () => {
    expect(classifyInfraError(new TypeError('fetch failed'))).toEqual({
      failureClass: 'network',
      retryable: true,
    });
    expect(classifyInfraError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toEqual({
      failureClass: 'network',
      retryable: true,
    });
    expect(classifyInfraError(Object.assign(new Error('x'), { code: 'P1001' }))).toEqual({
      failureClass: 'database',
      retryable: false,
    });
    expect(classifyInfraError(new Error('AI provider embed error: 500'))).toEqual({
      failureClass: 'provider_transient',
      retryable: true,
    });
    expect(classifyInfraError(new Error('outra coisa'))).toEqual({
      failureClass: 'harness',
      retryable: false,
    });
  });
});
