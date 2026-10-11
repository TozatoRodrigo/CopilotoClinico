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
import { strokeCaseFixture } from './case-fixture';
import { classifyInfraError, runCase, type PipelineServices } from './pipeline';
import { CompletionRecorder, type RecordedCompletion, type RecordedStopReason } from './recorder';
import type { Funnel } from './case.schema';
import type { PhysicianSimulator, SimulatorQuestion } from './simulator';

const clinicalCase = strokeCaseFixture();

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
    knowledgeSource: 'internal_kb',
    decisionPrompt: 'v1',
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
  const next = () => {
    const script = scripts.shift();
    if (!script) throw new Error('sem roteiro');
    return script(recorder);
  };
  const analyze = vi.fn((..._args: unknown[]) => next());
  // Gabarito v2 — afunilamento: a resposta às perguntas segue o mesmo roteiro.
  const continueAnalysis = vi.fn((..._args: unknown[]) => next());
  const services: PipelineServices = {
    orchestrator: { analyze, continueAnalysis } as unknown as OrchestratorService,
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
  return { services, analyze, continueAnalysis };
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

  // F1 — pesquisa web: a evidência e o rastro (modelo, buscas, custo) vão
  // para a linha, inclusive quando a análise não sai.
  describe('pesquisa web', () => {
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
      latencyMs: 9_000,
      cost: 0.05,
      fallbackReason: null,
    };

    it('grava a evidência e o rastro da pesquisa da análise entregue', async () => {
      const { services } = servicesWith([
        async (recorder) => {
          recorder.record(completion());
          return { ...analysis, output: { ...analysis.output, webEvidence } };
        },
      ]);
      vi.mocked(services.prisma.aiInteraction.findUnique).mockResolvedValue({
        retrievedChunkIds: ['web:1'],
        params: { knowledgeSource: 'web', research },
      } as never);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      if (outcome.kind !== 'result') throw new Error('esperava uma linha de resultado');
      expect(outcome.row).toMatchObject({ webEvidence, research });
    });

    it('grava a evidência e o rastro também quando a análise falha', async () => {
      const { services } = servicesWith([validationFailure(['Output is not valid JSON'])]);
      vi.mocked(services.prisma.aiInteraction.findFirst).mockResolvedValue({
        id: 'interacao-falha',
        retrievedChunkIds: ['web:1'],
        rawOutput: { raw: 'x', validationErrors: ['Output is not valid JSON'], webEvidence },
        params: { research },
      } as never);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      if (outcome.kind !== 'result') throw new Error('esperava uma linha de resultado');
      expect(outcome.row).toMatchObject({ status: 'invalid_output', webEvidence, research });
    });

    it('deixa evidência e rastro nulos quando a pesquisa não rodou', async () => {
      const { services } = servicesWith([
        async (recorder) => {
          recorder.record(completion());
          return analysis;
        },
      ]);

      const outcome = await runCase(services, clinicalCase, key, fastRetry);

      if (outcome.kind !== 'result') throw new Error('esperava uma linha de resultado');
      expect(outcome.row).toMatchObject({ webEvidence: null, research: null });
    });
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

// Gabarito v2 — afunilamento: o Copiloto recebe só a abertura e o médico
// simulado responde às perguntas pelo roteiro.
describe('runCase — afunilamento', () => {
  const simulator: PhysicianSimulator = {
    model: 'claude-haiku-5-5',
    answer: vi.fn(async (_funnel: Funnel, questions: SimulatorQuestion[]) => ({
      exchanges: questions.map((question) => ({
        questionId: question.id,
        question: question.question,
        answer: 'A fraqueza melhora e piora há 2 horas.',
        factIds: ['h-flutuacao'],
      })),
      model: 'claude-haiku-5-5',
      costUsd: 0.001,
      latencyMs: 5,
    })),
  };
  const turn = (turnIndex: number, withQuestions: boolean): OrchestratorResult => ({
    ...analysis,
    interactionId: `interacao-${turnIndex}`,
    output: {
      ...analysis.output,
      clarifyingQuestions: withQuestions ? analysis.output.clarifyingQuestions : [],
    },
    metadata: { ...analysis.metadata, turnIndex },
  });
  const funnelRun = { ...fastRetry, mode: 'funnel' as const };

  it('começa pela abertura, responde às perguntas e avalia o último turno', async () => {
    const { services, analyze, continueAnalysis } = servicesWith([
      async () => turn(0, true),
      async () => turn(1, false),
    ]);

    const outcome = await runCase({ ...services, simulator }, clinicalCase, key, funnelRun);

    expect(analyze.mock.calls[0]?.[2]).toMatchObject({ caseText: 'M 67a, fraqueza no braço D.' });
    expect(continueAnalysis.mock.calls[0]?.[2]).toEqual({
      interactionId: 'interacao-0',
      answers: [{ questionId: 'q1', answer: 'A fraqueza melhora e piora há 2 horas.' }],
    });
    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    expect(outcome.row).toMatchObject({
      mode: 'funnel',
      status: 'ok',
      interactionId: 'interacao-1',
    });
    expect(outcome.row.turns.map((item) => item.exchanges.length)).toEqual([1, 0]);
    expect(outcome.row.turns[0]?.exchanges[0]?.factIds).toEqual(['h-flutuacao']);
  });

  it('sem pergunta, mas com exame pedido, devolve o resultado e reanalisa', async () => {
    const ordering: OrchestratorResult = {
      ...turn(0, false),
      output: {
        ...turn(0, false).output,
        recommendations: [
          {
            action: 'TC de crânio sem contraste agora',
            rationale: 'Separa isquemia de hemorragia',
            citationChunkId: null,
            confidence: 0.9,
            preliminary: false,
            category: 'diagnostic',
            layer: 'now',
            dependsOn: null,
            basis: 'model_knowledge',
            chunkId: null,
            source: 'Conhecimento geral do modelo',
            sourceVersion: '',
            sourceText: '',
            sourceUrl: '',
            origin: 'model_knowledge',
          },
        ],
      },
    };
    const answer = vi.fn(async () => ({
      exchanges: [
        {
          questionId: 'correcao-do-entendimento',
          question: 'Resultado do que o Copiloto mandou fazer: TC de crânio sem contraste agora',
          answer: 'Resultados: TC sem sangramento.',
          factIds: ['t-tc'],
        },
      ],
      model: 'claude-haiku-5-5',
      costUsd: 0.001,
      latencyMs: 5,
    }));
    const { services, continueAnalysis } = servicesWith([
      async () => ordering,
      async () => turn(1, false),
    ]);

    await runCase(
      { ...services, simulator: { model: 'claude-haiku-5-5', answer } },
      clinicalCase,
      key,
      funnelRun,
    );

    expect(answer).toHaveBeenCalledWith(
      clinicalCase.input.funnel,
      [],
      ['TC de crânio sem contraste agora'],
    );
    expect(continueAnalysis.mock.calls[0]?.[2]).toMatchObject({
      answers: [
        { questionId: 'correcao-do-entendimento', answer: 'Resultados: TC sem sangramento.' },
      ],
    });
  });

  it('para no terceiro turno mesmo com pergunta pendente', async () => {
    const { services, continueAnalysis } = servicesWith([
      async () => turn(0, true),
      async () => turn(1, true),
      async () => turn(2, true),
    ]);

    const outcome = await runCase({ ...services, simulator }, clinicalCase, key, funnelRun);

    expect(continueAnalysis).toHaveBeenCalledTimes(2);
    if (outcome.kind === 'result') expect(outcome.row.turns).toHaveLength(3);
  });

  it('guarda os turnos respondidos quando a reanálise fica sem resposta', async () => {
    const { services } = servicesWith([
      async () => turn(0, true),
      validationFailure(['Output is not valid JSON']),
    ]);

    const outcome = await runCase({ ...services, simulator }, clinicalCase, key, funnelRun);

    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    expect(outcome.row.status).toBe('invalid_output');
    expect(outcome.row.turns).toHaveLength(1);
  });

  it('é falha do harness, fora da nota, quando o caso não tem roteiro', async () => {
    const { services } = servicesWith([]);
    const withoutFunnel = strokeCaseFixture({
      input: { caseText: clinicalCase.input.caseText },
    });

    const outcome = await runCase({ ...services, simulator }, withoutFunnel, key, funnelRun);

    expect(outcome).toMatchObject({ kind: 'error', row: { failureClass: 'harness' } });
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
