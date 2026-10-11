import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/config/prisma.service';
import { AiRefusalError, AiTruncatedError } from '../../src/modules/ai-gateway/ai-gateway.errors';
import type {
  OrchestratorResult,
  OrchestratorService,
} from '../../src/modules/copilot/orchestrator/orchestrator.service';
import type { EncountersService } from '../../src/modules/encounters/encounters.service';
import { understandingFixture } from '../../tests/fixtures/case-understanding';
import { loadCaseSet } from './cases';
import { classifyInfraError, runCase, type PipelineServices } from './pipeline';
import { CompletionRecorder, type RecordedCompletion, type RecordedStopReason } from './recorder';

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
    stopReason: null,
    refusalCategory: null,
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
  refusalFallback = false,
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
    refusalFallback,
  };
  return { services, analyze };
}

function validationFailure(errors: string[], stopReason: RecordedStopReason = null) {
  return async (recorder: CompletionRecorder): Promise<OrchestratorResult> => {
    recorder.record(completion());
    recorder.record(completion({ stopReason }));
    throw new BadRequestException({ message: 'AI output validation failed', errors });
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

  describe('sem resposta, nos dois estados do orquestrador', () => {
    const truncated = new AiTruncatedError({
      model: 'claude-opus-5-5',
      maxTokens: 16_000,
      usage: { promptTokens: 9_000, completionTokens: 16_000, totalTokens: 25_000 },
    });
    const refused = new AiRefusalError({
      model: 'claude-opus-5-5',
      category: 'bio',
      explanation: null,
      usage: { promptTokens: 9_000, completionTokens: 10, totalTokens: 9_010 },
    });

    // Gateway sem a contenção clínica (F0-C): o erro tipado sobe direto.
    it.each([
      [truncated, 'truncated', 'max_tokens'],
      [refused, 'refusal', 'refusal'],
    ] as const)('erro tipado %s vira desfecho %s', async (error, status, stopReason) => {
      const { services } = servicesWith([
        async (recorder) => {
          recorder.record(completion({ stopReason, content: null, error: error.message }));
          throw error;
        },
      ]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome).toMatchObject({
        kind: 'result',
        row: { status, output: null, validationErrors: [error.message], rawContent: null },
      });
    });

    // Com a contenção clínica: o orquestrador converte o erro tipado em
    // tentativa inválida e lança "AI output validation failed" marcado.
    it.each([
      ['OUTPUT TRUNCATED: the response hit the output token limit', 'truncated'],
      ['MODEL REFUSAL: the model declined to analyze this case (category: bio).', 'refusal'],
      ['Output is not valid JSON', 'invalid_output'],
    ])('BadRequest com "%s" vira desfecho %s', async (validationError, status) => {
      const { services } = servicesWith([validationFailure([validationError])]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome.kind).toBe('result');
      if (outcome.kind !== 'result') return;
      expect(outcome.row).toMatchObject({
        status,
        output: null,
        interactionId: 'interacao-falha',
        validationErrors: [validationError],
        rawContent: '{"reasoning": "corta',
        retrievedChunkIds: ['c1'],
      });
      expect(outcome.row.completions).toHaveLength(2);
    });

    it('sem marcador, decide pelo motivo de parada da última chamada gravada', async () => {
      const { services } = servicesWith([
        validationFailure(['Output is not valid JSON'], 'max_tokens'),
      ]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome).toMatchObject({ kind: 'result', row: { status: 'truncated' } });
    });
  });

  // F1 — variante com COPILOT_REASONING=stages: o entendimento do caso vai
  // para a linha de results.jsonl e, dali, para o juiz.
  describe('raciocínio em etapas', () => {
    it('grava o entendimento da análise entregue', async () => {
      const understanding = understandingFixture();
      const { services } = servicesWith([
        async (recorder) => {
          recorder.record(completion());
          recorder.record(completion());
          return {
            ...analysis,
            output: { ...analysis.output, understanding },
            metadata: { ...analysis.metadata, understandingLatencyMs: 2_000 },
          };
        },
      ]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome).toMatchObject({
        kind: 'result',
        row: { status: 'ok', understanding, metadata: { understandingLatencyMs: 2_000 } },
      });
    });

    it('grava o entendimento que a falha de validação deixou em rawOutput', async () => {
      const understanding = understandingFixture();
      const { services } = servicesWith([validationFailure(['Output is not valid JSON'])]);
      vi.mocked(services.prisma.aiInteraction.findFirst).mockResolvedValue({
        id: 'interacao-falha',
        retrievedChunkIds: ['c1'],
        rawOutput: { raw: '{', validationErrors: ['Output is not valid JSON'], understanding },
      } as never);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome).toMatchObject({
        kind: 'result',
        row: { status: 'invalid_output', understanding },
      });
    });

    it('fica null no legacy', async () => {
      const { services } = servicesWith([
        async (recorder) => {
          recorder.record(completion());
          return analysis;
        },
      ]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      expect(outcome).toMatchObject({ kind: 'result', row: { understanding: null } });
    });
  });

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

  it('com o fallback de recusa ativo, pontua a resposta do modelo de fallback e a marca', async () => {
    const { services } = servicesWith(
      [
        async (recorder) => {
          recorder.record(completion({ servedModel: 'claude-opus-4-8' }));
          return { ...analysis, metadata: { ...analysis.metadata, model: 'claude-opus-4-8' } };
        },
      ],
      true,
    );

    const outcome = await runCase(services, clinicalCase, key, fastRetry);

    expect(outcome).toMatchObject({
      kind: 'result',
      row: { status: 'ok', servedModel: 'claude-opus-4-8', servedByFallback: true },
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

  it('classifica os erros do SDK da Anthropic pelo status', () => {
    const headers = new Headers();
    expect(
      classifyInfraError(new Anthropic.RateLimitError(429, undefined, 'limite', headers)),
    ).toEqual({
      failureClass: 'provider_transient',
      retryable: true,
    });
    expect(
      classifyInfraError(new Anthropic.InternalServerError(529, undefined, 'sobrecarga', headers)),
    ).toEqual({
      failureClass: 'provider_transient',
      retryable: true,
    });
    expect(
      classifyInfraError(new Anthropic.BadRequestError(400, undefined, 'parâmetro', headers)),
    ).toEqual({
      failureClass: 'provider_rejected',
      retryable: false,
    });
    expect(classifyInfraError(new Anthropic.APIConnectionError({ message: 'rede' }))).toEqual({
      failureClass: 'network',
      retryable: true,
    });
  });
});
