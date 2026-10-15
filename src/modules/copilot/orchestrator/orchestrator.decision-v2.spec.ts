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
import { DECISION_V2_SYSTEM_PROMPT } from './decision-prompt-v2';
import {
  COPILOT_OUTPUT_JSON_SCHEMA,
  COPILOT_OUTPUT_V2_JSON_SCHEMA,
} from '../schemas/copilot-output.json-schema';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * F1 — decisão v2 e fontes de conhecimento (ADR-013, PR 2) no orquestrador:
 * `COPILOT_DECISION_PROMPT` e `COPILOT_KNOWLEDGE_SOURCE` nos três caminhos.
 * O padrão (v1 + internal_kb) é coberto por orchestrator.service.spec.ts e
 * orchestrator.stages.spec.ts.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';
const caseText = 'Homem, 68 anos, hemiparesia direita e afasia há 1h30. PA 182x104.';
const input = {
  caseText,
  context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
};

const AHA_URL = 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211';
const webEvidence = [
  {
    id: 'web:1',
    url: AHA_URL,
    title: 'Guidelines for the Early Management of Acute Ischemic Stroke',
    domain: 'ahajournals.org',
    citedText: 'Alteplase 0.9 mg/kg within 4.5 hours after hemorrhage is excluded.',
  },
];

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

const thrombolysis = recommendation({
  action: 'Trombólise com alteplase 0,9 mg/kg',
  rationale: 'AVC isquêmico dentro de 4,5 h',
  category: 'therapeutic',
  layer: 'depends',
  dependsOn: 'TC de crânio sem contraste sem hemorragia',
  basis: 'source',
  citationChunkId: 'web:1',
  confidence: 0.8,
});

function v2Output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reasoning: COVERED_REASONING,
    redFlags: [],
    recommendations: [thrombolysis, recommendation()],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [
      {
        id: 'q-ultimo-visto-bem',
        question: 'Qual o horário do último momento em que foi visto sem déficit?',
        why: 'Define a janela de reperfusão',
        separates: ['AVC na janela', 'AVC fora da janela'],
        criticality: 'blocker',
        expectedAnswerType: 'text',
        choices: null,
        purpose: 'Janela de reperfusão',
      },
    ],
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

function researchOutcome(overrides: Partial<ResearchOutcome> = {}): ResearchOutcome {
  return {
    evidence: webEvidence,
    model: 'claude-sonnet-5-5',
    usage: { promptTokens: 1000, completionTokens: 100, totalTokens: 1100, webSearchRequests: 3 },
    cost: 0.05,
    latencyMs: 9000,
    fallbackReason: null,
    ...overrides,
  };
}

describe('OrchestratorService — decisão v2 e fontes de conhecimento (F1)', () => {
  let env: Record<string, string>;
  let understand: ReturnType<typeof vi.fn>;
  let research: ReturnType<typeof vi.fn>;
  let retrieval: { search: ReturnType<typeof vi.fn>; searchMany: ReturnType<typeof vi.fn> };
  let gateway: { complete: ReturnType<typeof vi.fn>; completeStream: ReturnType<typeof vi.fn> };
  let interactionCreate: ReturnType<typeof vi.fn>;
  let interactionFindFirst: ReturnType<typeof vi.fn>;
  let attachmentsForPrompt: ReturnType<typeof vi.fn>;
  let service: OrchestratorService;
  let calls: string[];

  beforeEach(() => {
    env = {
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v2',
      COPILOT_KNOWLEDGE_SOURCE: 'web',
    };
    calls = [];
    understand = vi.fn(async () => {
      calls.push('understand');
      return stageOutcome();
    });
    research = vi.fn(async () => {
      calls.push('research');
      return researchOutcome();
    });
    // Busca na base = embedding (OpenAI): model_only e web nunca a chamam.
    retrieval = {
      search: vi.fn(() => {
        throw new Error('a busca na base (embedding) não pode rodar aqui');
      }),
      searchMany: vi.fn(() => {
        throw new Error('a busca na base (embedding) não pode rodar aqui');
      }),
    };
    gateway = {
      complete: vi.fn(async () => {
        calls.push('decide');
        return completion(v2Output());
      }),
      completeStream: vi.fn(),
    };
    interactionCreate = vi.fn().mockResolvedValue({ id: 'interaction-001' });
    interactionFindFirst = vi.fn();
    attachmentsForPrompt = vi.fn().mockResolvedValue([]);

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
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
    };

    service = new OrchestratorService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      retrieval as unknown as RetrievalService,
      { forPrompt: attachmentsForPrompt } as unknown as AttachmentsService,
      encounters as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      config as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research } as unknown as WebResearchService,
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
      data: {
        rawOutput: Record<string, unknown>;
        citations: { recommendations: Array<Record<string, unknown>> };
        cost: number;
        params: Record<string, unknown>;
        retrievedChunkIds: string[];
      };
    };
  }

  describe('COPILOT_KNOWLEDGE_SOURCE=web', () => {
    it('understands, researches from the understanding, then decides — without the embedding search', async () => {
      await service.analyze(physicianId, encounterId, input);

      expect(calls).toEqual(['understand', 'research', 'decide']);
      expect(research).toHaveBeenCalledWith({
        understanding: understandingFixture(),
        logLabel: '',
      });
      expect(retrieval.search).not.toHaveBeenCalled();
      expect(retrieval.searchMany).not.toHaveBeenCalled();
    });

    it('gives the web evidence to the v2 decision prompt, citable by its id', async () => {
      await service.analyze(physicianId, encounterId, input);

      const { messages, responseSchema } = sentRequest();
      expect(messages[0]).toEqual({ role: 'system', content: DECISION_V2_SYSTEM_PROMPT });
      expect(messages[1]?.content).toContain(
        '[ID: web:1] [Fonte: Guidelines for the Early Management of Acute Ischemic Stroke — ahajournals.org]',
      );
      expect(responseSchema).toBe(COPILOT_OUTPUT_V2_JSON_SCHEMA);
      expect(persisted().data.retrievedChunkIds).toEqual(['web:1']);
    });

    it('labels the web citation as an official external source linking to the page', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      const cited = result.output.recommendations.find((rec) => rec.citationChunkId === 'web:1');
      expect(cited).toMatchObject({
        origin: 'web_official',
        source: 'Guidelines for the Early Management of Acute Ischemic Stroke',
        sourceVersion: 'ahajournals.org',
        sourceUrl: AHA_URL,
        sourceText: webEvidence[0]!.citedText,
      });
      expect(result.citations).toEqual([
        expect.objectContaining({ chunkId: 'web:1', origin: 'web_official' }),
      ]);
    });

    it('persists the evidence, the research trace and its cost and latency', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      const { data } = persisted();
      expect(data.rawOutput.webEvidence).toEqual(webEvidence);
      expect(data.params).toMatchObject({
        knowledgeSource: 'web',
        decisionPrompt: 'v2',
        retrievalCoverage: null,
        research: {
          model: 'claude-sonnet-5-5',
          webSearchRequests: 3,
          evidenceItems: 1,
          latencyMs: 9000,
          cost: 0.05,
          fallbackReason: null,
        },
      });
      // Decisão (0,0033) + Etapa 1 (0,002) + pesquisa (0,05).
      expect(result.metadata.cost).toBeCloseTo(0.0553, 10);
      expect(data.cost).toBeCloseTo(0.0553, 10);
      expect(result.metadata).toMatchObject({
        knowledgeSource: 'web',
        decisionPrompt: 'v2',
        researchLatencyMs: 9000,
        retrievalCoverage: null,
      });
    });

    it('continues with the model knowledge when the research brings no evidence', async () => {
      research.mockResolvedValue(
        researchOutcome({ evidence: [], fallbackReason: 'nenhuma citação', cost: 0.03 }),
      );
      gateway.complete.mockResolvedValue(
        completion(v2Output({ recommendations: [recommendation()] })),
      );

      const result = await service.analyze(physicianId, encounterId, input);

      const user = sentRequest().messages[1]?.content ?? '';
      expect(user).not.toContain('<web_evidence');
      expect(user).toContain('No evidence excerpts are available');
      expect(result.output.webEvidence).toEqual([]);
      expect(persisted().data.params).toMatchObject({
        research: { fallbackReason: 'nenhuma citação' },
      });
      expect(retrieval.search).not.toHaveBeenCalled();
    });

    it('does not research without an understanding, and never falls back to the embedding search', async () => {
      understand.mockResolvedValue(stageOutcome({ understanding: null }));
      gateway.complete.mockResolvedValue(
        completion(v2Output({ recommendations: [recommendation()] })),
      );

      const result = await service.analyze(physicianId, encounterId, input);

      expect(research).not.toHaveBeenCalled();
      expect(retrieval.search).not.toHaveBeenCalled();
      expect(retrieval.searchMany).not.toHaveBeenCalled();
      expect(sentRequest().messages[1]?.content).toContain(
        'Stage 1 did not produce a case understanding',
      );
      expect(result.output).not.toHaveProperty('webEvidence');
    });

    it('runs neither the research nor the embedding search without stages', async () => {
      env = { COPILOT_KNOWLEDGE_SOURCE: 'web', COPILOT_DECISION_PROMPT: 'v2' };
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
      expect(research).not.toHaveBeenCalled();
      expect(retrieval.search).not.toHaveBeenCalled();
      expect(sentRequest().responseSchema).toBe(COPILOT_OUTPUT_JSON_SCHEMA);
      expect(result.metadata).toMatchObject({
        knowledgeSource: 'model_only',
        decisionPrompt: 'v1',
      });
    });
  });

  describe('COPILOT_KNOWLEDGE_SOURCE=model_only', () => {
    beforeEach(() => {
      env = { ...env, COPILOT_KNOWLEDGE_SOURCE: 'model_only' };
      gateway.complete.mockResolvedValue(
        completion(v2Output({ recommendations: [recommendation()] })),
      );
    });

    it('decides from the understanding alone: no retrieval, no research, no embedding', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      expect(calls).toEqual(['understand']);
      expect(research).not.toHaveBeenCalled();
      expect(retrieval.search).not.toHaveBeenCalled();
      expect(retrieval.searchMany).not.toHaveBeenCalled();
      expect(result.metadata).toMatchObject({
        knowledgeSource: 'model_only',
        chunksRetrieved: 0,
        retrievalCoverage: null,
      });
      expect(result.output).not.toHaveProperty('webEvidence');
    });

    it('keeps the physician attachments citable', async () => {
      attachmentsForPrompt.mockResolvedValue([
        { id: 'a1', filename: 'protocolo-avc.pdf', text: 'TC em 25 minutos.' },
      ]);

      await service.analyze(physicianId, encounterId, input);

      expect(sentRequest().messages[1]?.content).toContain('[ID: anexo:a1]');
      expect(persisted().data.retrievedChunkIds).toEqual(['anexo:a1']);
    });

    it('never calls the embedding search in legacy reasoning either', async () => {
      env = { COPILOT_KNOWLEDGE_SOURCE: 'model_only' };
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

      await service.analyze(physicianId, encounterId, input);

      expect(retrieval.search).not.toHaveBeenCalled();
      expect(retrieval.searchMany).not.toHaveBeenCalled();
      expect(sentRequest().messages[0]?.content).toContain('MANDATORY RULES:');
    });
  });

  describe('contenção e rótulos da v2', () => {
    it('puts "now" before "depends", and marks only "depends" as waiting for its data', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      expect(
        result.output.recommendations.map((rec) => [
          rec.layer,
          rec.preliminary,
          rec.preliminaryReason,
        ]),
      ).toEqual([
        ['now', false, undefined],
        ['depends', true, 'depends_on_data'],
      ]);
    });

    it('shows model knowledge with its origin badge, no source and no citation', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      const modelKnowledge = result.output.recommendations[0];
      expect(modelKnowledge).toMatchObject({
        basis: 'model_knowledge',
        citationChunkId: null,
        chunkId: null,
        origin: 'model_knowledge',
        source: 'Conhecimento geral do modelo',
        sourceUrl: '',
        preliminary: false,
      });
      expect(result.citations.map((citation) => citation.chunkId)).toEqual(['web:1']);
    });

    it('keeps but flags model knowledge that still carries a dose after the retry', async () => {
      const dosed = recommendation({
        action: 'Glicose 50% 40 mL IV se hipoglicemia',
        category: 'therapeutic',
      });
      gateway.complete.mockResolvedValue(completion(v2Output({ recommendations: [dosed] })));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(gateway.complete).toHaveBeenCalledTimes(2);
      expect(result.output.recommendations[0]).toMatchObject({
        preliminary: true,
        preliminaryReason: 'unverified_dose',
        origin: 'model_knowledge',
      });
    });

    it('shows a "source" recommendation with no citable id as model knowledge', async () => {
      const unfounded = recommendation({ basis: 'source', citationChunkId: 'chunk-inventado' });
      gateway.complete.mockResolvedValue(completion(v2Output({ recommendations: [unfounded] })));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(result.output.recommendations[0]).toMatchObject({
        basis: 'model_knowledge',
        citationChunkId: null,
        origin: 'model_knowledge',
      });
      expect(result.citations).toEqual([]);
    });
  });

  describe('retry das regras corrigíveis', () => {
    const depending = recommendation({ layer: 'depends', dependsOn: null });

    it('retries once with the correction, and keeps the corrected answer', async () => {
      gateway.complete
        .mockResolvedValueOnce(completion(v2Output({ recommendations: [depending] })))
        .mockResolvedValueOnce(completion(v2Output()));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(gateway.complete).toHaveBeenCalledTimes(2);
      const feedback = sentRequest(1).messages.at(-1)?.content ?? '';
      expect(feedback).toContain('DEPENDS WITHOUT DATA');
      expect(sentRequest(1).responseSchema).toBe(COPILOT_OUTPUT_V2_JSON_SCHEMA);
      expect(result.output.recommendations).toHaveLength(2);
      // Duas decisões (0,0066) + Etapa 1 (0,002) + pesquisa (0,05).
      expect(result.metadata.cost).toBeCloseTo(0.0586, 10);
    });

    it('never blocks: a finding that survives the retry becomes a warning', async () => {
      gateway.complete.mockResolvedValue(completion(v2Output({ recommendations: [depending] })));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(gateway.complete).toHaveBeenCalledTimes(2);
      expect(result.output.recommendations[0]).toMatchObject({
        layer: 'depends',
        dependsOn: null,
        preliminaryReason: 'depends_on_data',
      });
    });

    it('keeps the first answer when the retry breaks it', async () => {
      gateway.complete
        .mockResolvedValueOnce(completion(v2Output({ recommendations: [depending] })))
        .mockResolvedValueOnce(completion('não é JSON'));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(result.output.recommendations[0]).toMatchObject({ layer: 'depends' });
      expect(result.metadata.cost).toBeCloseTo(0.0586, 10);
    });

    it('still fails a dead end after the retry, as in v1', async () => {
      gateway.complete.mockResolvedValue(
        completion(v2Output({ recommendations: [], clarifyingQuestions: [] })),
      );

      await expect(service.analyze(physicianId, encounterId, input)).rejects.toThrow(
        'AI output validation failed',
      );
      expect(persisted().data.rawOutput).toMatchObject({ webEvidence });
    });
  });

  describe('analyzeStream', () => {
    async function* fakeStream(content: string): AsyncGenerator<string, StreamCompletionResult> {
      yield content;
      return {
        content,
        model: 'claude-3-sonnet',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        stopReason: 'end_turn',
      };
    }

    it('emits the understanding, researches, and streams the v2 decision', async () => {
      gateway.completeStream.mockImplementation(() => fakeStream(v2Output()));

      const events: StreamEvent[] = [];
      for await (const event of service.analyzeStream(physicianId, encounterId, input)) {
        events.push(event);
      }

      expect(events.map((event) => event.type)).toEqual(['understanding', 'delta', 'done']);
      expect(research).toHaveBeenCalledWith({
        understanding: understandingFixture(),
        logLabel: ' (stream)',
      });
      const request = gateway.completeStream.mock.calls[0]![0] as { responseSchema: unknown };
      expect(request.responseSchema).toBe(COPILOT_OUTPUT_V2_JSON_SCHEMA);
      const done = events.at(-1);
      if (done?.type !== 'done') throw new Error('o stream terminou sem evento done');
      expect(done.result.output.webEvidence).toEqual(webEvidence);
      expect(done.result.metadata.researchLatencyMs).toBe(9000);
    });
  });

  describe('continueAnalysis', () => {
    beforeEach(() => {
      interactionFindFirst.mockResolvedValue({
        id: 'interaction-parent',
        encounterId,
        turnIndex: 0,
        inputRedacted: caseText,
        answeredQuestions: null,
        params: { demoCase: null, redFlags: {} },
        rawOutput: {
          reasoning: 'Avaliação inicial',
          recommendations: [],
          uncertainty: false,
          uncertaintyReason: null,
          clarifyingQuestions: [
            {
              id: 'q-glicemia',
              question: 'Qual a glicemia capilar?',
              why: 'Hipoglicemia mimetiza AVC',
              criticality: 'blocker',
              expectedAnswerType: 'number',
            },
          ],
        },
      });
      interactionCreate.mockResolvedValue({ id: 'interaction-002' });
    });

    it('researches again from the new understanding before deciding', async () => {
      const result = await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-parent',
        answers: [{ questionId: 'q-glicemia', answer: '112' }],
      });

      expect(calls).toEqual(['understand', 'research', 'decide']);
      expect(research).toHaveBeenCalledWith(expect.objectContaining({ logLabel: ' (respond)' }));
      expect(retrieval.search).not.toHaveBeenCalled();
      expect(sentRequest().messages[0]?.content).toBe(DECISION_V2_SYSTEM_PROMPT);
      expect(result.output.webEvidence).toEqual(webEvidence);
    });

    it('asks for at least one conduct in the last turn, with what still depends on data in "depends"', async () => {
      env = { ...env, COPILOT_MAX_TURNS: '2' };

      await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-parent',
        answers: [{ questionId: 'q-glicemia', answer: '112' }],
      });

      const user = sentRequest().messages[1]?.content ?? '';
      expect(user).toContain('Este é o último turno permitido');
      expect(user).toContain('camada "depends"');
    });
  });
});
