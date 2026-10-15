import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { OrchestratorService, type StreamEvent } from './orchestrator.service';
import type { PrismaService } from '../../../config/prisma.service';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type {
  ChatMessage,
  StreamCompletionResult,
} from '../../ai-gateway/providers/provider.interface';
import type { RetrievalService } from '../retrieval/retrieval.service';
import type { EncountersService } from '../../encounters/encounters.service';
import type { AttachmentsService } from '../../encounters/attachments/attachments.service';
import type { AuditService } from '../../audit/audit.service';
import type {
  UnderstandingOutcome,
  UnderstandingService,
} from '../understanding/understanding.service';
import type { ResearchOutcome, WebResearchService } from '../research/web-research.service';
import { cardRetrievalNeverCalled } from '../../../../tests/fixtures/reviewed-cards';
import { DECISION_V3_SYSTEM_PROMPT } from './decision-prompt-v3';
import { DECISION_V4_SYSTEM_PROMPT } from './decision-prompt-v4';
import { COPILOT_OUTPUT_V2_JSON_SCHEMA } from '../schemas/copilot-output.json-schema';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * Decisão v3 (emenda de 11/10/2026 ao ADR-013) no orquestrador: o prompt
 * escolhido pela versão, o contrato de saída da v2 e o validador v3 — que
 * corrige sem retry o que o código resolve sozinho e nunca bloqueia por
 * linguagem de probabilidade.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';
const caseText = 'Homem, 68 anos, hemiparesia direita e afasia há 1h30. PA 182x104.';
const input = {
  caseText,
  context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
};

const COVERED_REASONING =
  'Déficit focal súbito na janela. Afastar hipoglicemia e hemorragia intracerebral; oclusão de grande vaso indica trombectomia.';

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    action: 'TC de crânio sem contraste imediata',
    rationale: 'Separa AVC isquêmico de hemorrágico',
    category: 'diagnostic',
    layer: 'now',
    dependsOn: null,
    basis: 'model_knowledge',
    citationChunkId: null,
    confidence: 0.9,
    ...overrides,
  };
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-ultimo-visto-bem',
    question: 'Qual o horário do último momento em que foi visto sem déficit?',
    why: 'Define a janela de reperfusão',
    separates: ['AVC na janela', 'AVC fora da janela'],
    criticality: 'blocker',
    expectedAnswerType: 'text',
    choices: null,
    purpose: 'Janela de reperfusão',
    ...overrides,
  };
}

function v3Output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reasoning: COVERED_REASONING,
    redFlags: [],
    recommendations: [recommendation()],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [question()],
    ...overrides,
  });
}

// claude-3-sonnet: 100 × $3 + 200 × $15, por milhão = US$ 0,0033.
function completion(content: string) {
  return {
    content,
    model: 'claude-3-sonnet',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    latencyMs: 1500,
  };
}

function stageOutcome(overrides: Partial<UnderstandingOutcome> = {}): UnderstandingOutcome {
  return {
    understanding: understandingFixture(),
    model: 'claude-haiku-5-5',
    usage: { promptTokens: 2000, completionTokens: 400, totalTokens: 2400 },
    cost: 0.002,
    latencyMs: 2100,
    ...overrides,
  };
}

const webEvidence = [
  {
    id: 'web:1',
    url: 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211',
    title: 'Guidelines for the Early Management of Acute Ischemic Stroke',
    domain: 'ahajournals.org',
    citedText: 'Alteplase 0.9 mg/kg within 4.5 hours after hemorrhage is excluded.',
  },
];

function researchOutcome(): ResearchOutcome {
  return {
    evidence: webEvidence,
    model: 'claude-sonnet-5-5',
    usage: { promptTokens: 1000, completionTokens: 100, totalTokens: 1100, webSearchRequests: 3 },
    cost: 0.05,
    latencyMs: 9000,
    fallbackReason: null,
  };
}

describe('OrchestratorService — decisão v3', () => {
  let env: Record<string, string>;
  let understand: ReturnType<typeof vi.fn>;
  let research: ReturnType<typeof vi.fn>;
  let gateway: { complete: ReturnType<typeof vi.fn>; completeStream: ReturnType<typeof vi.fn> };
  let interactionCreate: ReturnType<typeof vi.fn>;
  let interactionFindFirst: ReturnType<typeof vi.fn>;
  let service: OrchestratorService;

  beforeEach(() => {
    env = {
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v3',
      COPILOT_KNOWLEDGE_SOURCE: 'model_only',
    };
    understand = vi.fn().mockResolvedValue(stageOutcome());
    research = vi.fn().mockResolvedValue(researchOutcome());
    gateway = {
      complete: vi.fn().mockResolvedValue(completion(v3Output())),
      completeStream: vi.fn(),
    };
    interactionCreate = vi.fn().mockResolvedValue({ id: 'interaction-001' });
    interactionFindFirst = vi.fn();

    const prisma = {
      aiInteraction: { create: interactionCreate, findFirst: interactionFindFirst },
      physician: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const encounters = {
      findById: vi.fn().mockResolvedValue({
        id: encounterId,
        physicianId,
        patientRef: 'PRN-001',
        institutionId: 'inst-1',
        context: input.context,
      }),
      update: vi.fn().mockResolvedValue({}),
      updateChiefComplaint: vi.fn().mockResolvedValue(undefined),
    };
    const embeddingSearch = vi.fn(() => {
      throw new Error('a busca na base (embedding) não pode rodar aqui');
    });
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
    };

    service = new OrchestratorService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      { search: embeddingSearch, searchMany: embeddingSearch } as unknown as RetrievalService,
      { forPrompt: vi.fn().mockResolvedValue([]) } as unknown as AttachmentsService,
      encounters as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      config as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research } as unknown as WebResearchService,
      cardRetrievalNeverCalled(),
    );
  });

  function sentRequest(call = 0) {
    return gateway.complete.mock.calls[call]?.[0] as {
      messages: ChatMessage[];
      responseSchema: unknown;
    };
  }

  function persisted(call = 0) {
    return interactionCreate.mock.calls[call]![0] as {
      data: { params: Record<string, unknown> };
    };
  }

  it('decides with the v3 system prompt and the v2 output contract', async () => {
    const result = await service.analyze(physicianId, encounterId, input);

    const { messages, responseSchema } = sentRequest();
    expect(messages[0]).toEqual({ role: 'system', content: DECISION_V3_SYSTEM_PROMPT });
    expect(messages[1]?.content).toContain('<case_understanding type="MODEL_DERIVED_FROM_CASE">');
    expect(responseSchema).toBe(COPILOT_OUTPUT_V2_JSON_SCHEMA);
    expect(result.metadata).toMatchObject({ decisionPrompt: 'v3', knowledgeSource: 'model_only' });
    expect(persisted().data.params).toMatchObject({ decisionPrompt: 'v3' });
    expect(result.output.recommendations[0]).toMatchObject({
      layer: 'now',
      origin: 'model_knowledge',
      preliminary: false,
    });
  });

  it('v4: decides with the v4 system prompt, the same contract and the v3 validator', async () => {
    env = { ...env, COPILOT_DECISION_PROMPT: 'v4' };

    const result = await service.analyze(physicianId, encounterId, input);

    const { messages, responseSchema } = sentRequest();
    expect(messages[0]).toEqual({ role: 'system', content: DECISION_V4_SYSTEM_PROMPT });
    expect(responseSchema).toBe(COPILOT_OUTPUT_V2_JSON_SCHEMA);
    expect(result.metadata).toMatchObject({ decisionPrompt: 'v4' });
  });

  it('falls back to v1 without stages, as v2 does', async () => {
    env = { COPILOT_DECISION_PROMPT: 'v3', COPILOT_KNOWLEDGE_SOURCE: 'model_only' };
    gateway.complete.mockResolvedValue(
      completion(
        JSON.stringify({
          reasoning: 'Sem evidência.',
          recommendations: [],
          uncertainty: true,
          uncertaintyReason: 'Sem diretriz',
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Há quanto tempo começou?',
              why: 'Janela',
              criticality: 'blocker',
              expectedAnswerType: 'text',
            },
          ],
        }),
      ),
    );

    const result = await service.analyze(physicianId, encounterId, input);

    expect(understand).not.toHaveBeenCalled();
    expect(sentRequest().messages[0]?.content).toContain('MANDATORY RULES:');
    expect(result.metadata.decisionPrompt).toBe('v1');
  });

  it('removes a question about data the case gives, without a second call', async () => {
    gateway.complete.mockResolvedValue(
      completion(
        v3Output({
          clarifyingQuestions: [question({ id: 'q-idade', question: 'Qual a idade?' }), question()],
        }),
      ),
    );

    const result = await service.analyze(physicianId, encounterId, input);

    expect(gateway.complete).toHaveBeenCalledTimes(1);
    expect(result.output.clarifyingQuestions.map((q) => q.id)).toEqual(['q-ultimo-visto-bem']);
  });

  it('leaves an uncovered cannot-miss hypothesis to the understanding card, without a retry', async () => {
    gateway.complete.mockResolvedValue(completion(v3Output({ reasoning: 'Provável AVC.' })));

    await service.analyze(physicianId, encounterId, input);

    expect(gateway.complete).toHaveBeenCalledTimes(1);
  });

  it('retries probability language once and, if it persists, answers anyway', async () => {
    gateway.complete.mockResolvedValue(
      completion(
        v3Output({
          differentials: [
            {
              hypothesis: 'Hemorragia intracerebral',
              whyConsider: 'Responde por 15% dos AVC',
              whatDistinguishes: 'TC de crânio sem contraste',
              cannotMiss: true,
              timeToHarm: 'minutos',
            },
          ],
        }),
      ),
    );

    const result = await service.analyze(physicianId, encounterId, input);

    expect(gateway.complete).toHaveBeenCalledTimes(2);
    expect(sentRequest(1).messages.at(-1)?.content).toContain('PROBABILITY LANGUAGE NOT ALLOWED');
    expect(result.output.differentials).toHaveLength(1);
  });

  it('researches the web and cites it with v3, as with v2', async () => {
    env = { ...env, COPILOT_KNOWLEDGE_SOURCE: 'web' };
    gateway.complete.mockResolvedValue(
      completion(
        v3Output({
          recommendations: [
            recommendation({
              action: 'Trombólise com alteplase 0,9 mg/kg',
              category: 'therapeutic',
              layer: 'depends',
              dependsOn: 'TC sem hemorragia',
              basis: 'source',
              citationChunkId: 'web:1',
            }),
          ],
        }),
      ),
    );

    const result = await service.analyze(physicianId, encounterId, input);

    expect(research).toHaveBeenCalledTimes(1);
    expect(sentRequest().messages[0]?.content).toBe(DECISION_V3_SYSTEM_PROMPT);
    expect(result.output.recommendations[0]).toMatchObject({
      citationChunkId: 'web:1',
      origin: 'web_official',
      preliminaryReason: 'depends_on_data',
    });
    expect(result.metadata.knowledgeSource).toBe('web');
  });

  it('streams the v3 decision with the v2 output contract', async () => {
    async function* fakeStream(content: string): AsyncGenerator<string, StreamCompletionResult> {
      yield content;
      return {
        content,
        model: 'claude-3-sonnet',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        stopReason: 'end_turn',
      };
    }
    gateway.completeStream.mockImplementation(() => fakeStream(v3Output()));

    const events: StreamEvent[] = [];
    for await (const event of service.analyzeStream(physicianId, encounterId, input)) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['understanding', 'delta', 'done']);
    const request = gateway.completeStream.mock.calls[0]![0] as {
      messages: ChatMessage[];
      responseSchema: unknown;
    };
    expect(request.messages[0]?.content).toBe(DECISION_V3_SYSTEM_PROMPT);
    expect(request.responseSchema).toBe(COPILOT_OUTPUT_V2_JSON_SCHEMA);
  });

  it('asks for at least one conduct in the last turn of a reanalysis', async () => {
    env = { ...env, COPILOT_MAX_TURNS: '2' };
    interactionFindFirst.mockResolvedValue({
      id: 'interaction-parent',
      encounterId,
      turnIndex: 0,
      inputRedacted: caseText,
      answeredQuestions: null,
      params: { demoCase: null, redFlags: {} },
      rawOutput: { reasoning: 'Inicial', recommendations: [], clarifyingQuestions: [question()] },
    });

    await service.continueAnalysis(physicianId, encounterId, {
      interactionId: 'interaction-parent',
      answers: [{ questionId: 'q-ultimo-visto-bem', answer: 'Há 1 hora' }],
    });

    const { messages } = sentRequest();
    expect(messages[0]?.content).toBe(DECISION_V3_SYSTEM_PROMPT);
    expect(messages[1]?.content).toContain('camada "depends"');
  });
});
