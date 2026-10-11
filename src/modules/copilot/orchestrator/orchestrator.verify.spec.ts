import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { OrchestratorService, type StreamEvent } from './orchestrator.service';
import type { PrismaService } from '../../../config/prisma.service';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type {
  ChatMessage,
  CompletionParams,
  ResearchParams,
  ResearchResponse,
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
import type { WebResearchService } from '../research/web-research.service';
import { SOURCE_VERIFICATION_SYSTEM_PROMPT } from '../research/source-verification-prompt';
import { DECISION_V3_SYSTEM_PROMPT } from './decision-prompt-v3';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

/**
 * Verificação com fonte depois da decisão (`COPILOT_KNOWLEDGE_SOURCE=verify`)
 * no orquestrador, com o gateway mockado: a decisão roda como em
 * `model_only`, a verificação mescla fonte, dose e divergência e grava o
 * rastro como o modo web — e, quando falha, a saída da decisão segue intacta.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';
const caseText = 'Homem, 68 anos, hemiparesia direita e afasia há 1h30. PA 182x104.';
const input = {
  caseText,
  context: { hasCT: true, isSus: false, hasLab: true, hasICU: false },
};

const GOV_URL = 'https://www.gov.br/saude/protocolo-avc';
const AHA_URL = 'https://www.ahajournals.org/doi/10.1161/STR.0000000000000211';

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

// Na saída da decisão: [A1] = recomendação 1, [A2] = 2, [A3] = 3. A 0 é exame.
const decided = [
  recommendation(),
  recommendation({
    action: 'Trombólise com alteplase',
    rationale: 'AVC isquêmico na janela',
    category: 'therapeutic',
    layer: 'depends',
    dependsOn: 'TC de crânio sem contraste sem hemorragia',
    confidence: 0.8,
  }),
  recommendation({
    action: 'Sala de emergência com monitorização e acionamento do protocolo de AVC',
    rationale: 'Reperfusão depende de TC e equipe em minutos',
    category: 'stabilization',
  }),
  recommendation({
    action: 'Labetalol IV se PA acima do alvo',
    rationale: 'Controle pressórico no AVC agudo',
    category: 'therapeutic',
    confidence: 0.7,
  }),
];

function decisionOutput(): string {
  return JSON.stringify({
    reasoning:
      'Déficit focal súbito na janela. Afastar hipoglicemia e hemorragia intracerebral; oclusão de grande vaso indica trombectomia.',
    redFlags: [],
    recommendations: decided,
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
  });
}

// claude-3-sonnet: 100 × $3 + 200 × $15, por milhão = US$ 0,0033.
function decisionCompletion() {
  return {
    content: decisionOutput(),
    model: 'claude-3-sonnet',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    latencyMs: 1500,
  };
}

const CONFLICT = 'A fonte reserva o labetalol para PA acima de 185/110 antes da trombólise.';

function researchResponse(): ResearchResponse {
  return {
    text: '[A1] Alteplase… [A3] Labetalol…',
    citations: [
      {
        url: GOV_URL,
        title: 'Protocolo de AVC',
        citedText: 'Alteplase 0,9 mg/kg IV (máximo de 90 mg), após TC sem hemorragia.',
      },
      {
        url: AHA_URL,
        title: 'AHA/ASA 2019',
        citedText: 'Labetalol 10–20 mg IV when BP > 185/110 before thrombolysis.',
      },
    ],
    model: 'claude-sonnet-5-5',
    // 100 mil × $2 + 2 mil × $10, por milhão, + 3 buscas = US$ 0,25.
    usage: {
      promptTokens: 100_000,
      completionTokens: 2_000,
      totalTokens: 102_000,
      webSearchRequests: 3,
    },
    latencyMs: 12_000,
    continuations: 0,
    stopReason: 'end_turn',
  };
}

// claude-sonnet-5-5: 10 mil × $2 + mil × $10, por milhão = US$ 0,03.
function attachCompletion() {
  return {
    content: JSON.stringify({
      items: [
        // Dose literal no trecho: entra no texto da conduta.
        { action: 1, citationId: 'web:1', dose: '0,9 mg/kg IV', conflict: null },
        // Id que não é desta análise: ignorado.
        { action: 2, citationId: 'web:9', dose: null, conflict: null },
        // Dose que o trecho não traz: cai; o conflito fica.
        { action: 3, citationId: 'web:2', dose: '20 mg IV em bolus', conflict: CONFLICT },
      ],
    }),
    model: 'claude-sonnet-5-5',
    usage: { promptTokens: 10_000, completionTokens: 1_000, totalTokens: 11_000 },
    latencyMs: 900,
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

const isAttach = (params: CompletionParams) => params.responseSchema?.name === 'source_attach';

describe('OrchestratorService — verificação com fonte depois da decisão', () => {
  let env: Record<string, string>;
  let calls: string[];
  let understand: ReturnType<typeof vi.fn>;
  let gateway: {
    complete: ReturnType<typeof vi.fn>;
    completeStream: ReturnType<typeof vi.fn>;
    research: ReturnType<typeof vi.fn>;
  };
  let interactionCreate: ReturnType<typeof vi.fn>;
  let interactionFindFirst: ReturnType<typeof vi.fn>;
  let service: OrchestratorService;

  beforeEach(() => {
    env = {
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v3',
      COPILOT_KNOWLEDGE_SOURCE: 'verify',
    };
    calls = [];
    understand = vi.fn(async () => {
      calls.push('understand');
      return stageOutcome();
    });
    gateway = {
      complete: vi.fn(async (params: CompletionParams) => {
        calls.push(isAttach(params) ? 'attach' : 'decide');
        return isAttach(params) ? attachCompletion() : decisionCompletion();
      }),
      completeStream: vi.fn(),
      research: vi.fn(async () => {
        calls.push('verify-research');
        return researchResponse();
      }),
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
    const forbidden = (what: string) =>
      vi.fn(() => {
        throw new Error(`${what} não pode rodar em verify`);
      });
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
    };

    service = new OrchestratorService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      {
        search: forbidden('a busca na base'),
        searchMany: forbidden('a busca na base'),
      } as unknown as RetrievalService,
      { forPrompt: vi.fn().mockResolvedValue([]) } as unknown as AttachmentsService,
      encounters as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      config as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research: forbidden('a pesquisa antes da decisão') } as unknown as WebResearchService,
    );
  });

  function decisionMessages(): ChatMessage[] {
    const call = gateway.complete.mock.calls.find(
      ([params]) => !isAttach(params as CompletionParams),
    );
    return (call?.[0] as CompletionParams).messages;
  }

  function persisted() {
    return interactionCreate.mock.calls[0]![0] as {
      data: {
        rawOutput: Record<string, unknown>;
        params: Record<string, unknown>;
        retrievedChunkIds: string[];
        cost: number;
      };
    };
  }

  describe('analyze', () => {
    it('decides as in model_only and verifies only afterwards', async () => {
      await service.analyze(physicianId, encounterId, input);

      expect(calls).toEqual(['understand', 'decide', 'verify-research', 'attach']);
      const messages = decisionMessages();
      expect(messages[0]?.content).toBe(DECISION_V3_SYSTEM_PROMPT);
      expect(messages[1]?.content).toContain('No evidence excerpts are available for this case');
      expect(persisted().data.retrievedChunkIds).toEqual([]);
    });

    it('sends the decision prompt byte for byte as model_only does', async () => {
      await service.analyze(physicianId, encounterId, input);
      const verifyMessages = decisionMessages();

      gateway.complete.mockClear();
      env = { ...env, COPILOT_KNOWLEDGE_SOURCE: 'model_only' };
      await service.analyze(physicianId, encounterId, input);

      expect(decisionMessages()).toEqual(verifyMessages);
      expect(gateway.research).toHaveBeenCalledTimes(1);
    });

    it('researches the treatment and stabilization actions, never the case', async () => {
      await service.analyze(physicianId, encounterId, input);

      const params = gateway.research.mock.calls[0]![0] as ResearchParams;
      expect(params.system).toBe(SOURCE_VERIFICATION_SYSTEM_PROMPT);
      expect(params.prompt).toContain(
        '[A1] Trombólise com alteplase\n[A2] Sala de emergência com monitorização e acionamento do protocolo de AVC\n[A3] Labetalol IV se PA acima do alvo',
      );
      expect(params.prompt).not.toContain('TC de crânio sem contraste imediata');
      expect(params.prompt).not.toContain(caseText);
      expect(params.prompt).not.toContain(understandingFixture().problemRepresentation);
      expect(params.prompt).not.toContain('182');
    });

    it('merges the source, the literal dose and the divergence into the recommendations', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      const byAction = (prefix: string) =>
        result.output.recommendations.find((rec) => rec.action.startsWith(prefix));

      expect(byAction('Trombólise')).toMatchObject({
        action: 'Trombólise com alteplase — dose na fonte: 0,9 mg/kg IV',
        basis: 'source',
        citationChunkId: 'web:1',
        chunkId: 'web:1',
        origin: 'web_official',
        source: 'Protocolo de AVC',
        sourceVersion: 'gov.br',
        sourceUrl: GOV_URL,
        layer: 'depends',
        preliminary: true,
        preliminaryReason: 'depends_on_data',
      });
      expect(byAction('Labetalol')).toMatchObject({
        action: 'Labetalol IV se PA acima do alvo',
        rationale: `Controle pressórico no AVC agudo Fonte oficial diverge: ${CONFLICT}`,
        basis: 'source',
        citationChunkId: 'web:2',
        origin: 'web_official',
        sourceUrl: AHA_URL,
        preliminary: true,
        preliminaryReason: 'source_conflict',
      });
      // Id inventado pelo vínculo: a conduta fica como a decisão a deixou.
      expect(byAction('Sala de emergência')).toMatchObject({
        basis: 'model_knowledge',
        citationChunkId: null,
        origin: 'model_knowledge',
        preliminary: false,
      });
      expect(byAction('TC de crânio')).toMatchObject({ origin: 'model_knowledge' });
      expect(result.citations).toEqual([
        expect.objectContaining({ chunkId: 'web:2', origin: 'web_official' }),
        expect.objectContaining({ chunkId: 'web:1', origin: 'web_official' }),
      ]);
    });

    it('keeps the order of the output: "now" before "depends", stabilization first', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      expect(result.output.recommendations.map((rec) => rec.action.split(' ')[0])).toEqual([
        'Sala',
        'TC',
        'Labetalol',
        'Trombólise',
      ]);
    });

    it('records the trace, the evidence, the latency and the cost as the web mode does', async () => {
      const result = await service.analyze(physicianId, encounterId, input);

      const { data } = persisted();
      expect(data.params).toMatchObject({
        knowledgeSource: 'verify',
        decisionPrompt: 'v3',
        retrievalCoverage: null,
        research: {
          model: 'claude-sonnet-5-5',
          webSearchRequests: 3,
          evidenceItems: 2,
          fallbackReason: null,
        },
      });
      const research = data.params.research as { cost: number; latencyMs: number };
      // Pesquisa (0,25) + vínculo (0,03).
      expect(research.cost).toBeCloseTo(0.28, 10);
      expect(data.rawOutput.webEvidence).toEqual([
        expect.objectContaining({ id: 'web:1', url: GOV_URL }),
        expect.objectContaining({ id: 'web:2', url: AHA_URL }),
      ]);
      expect(result.output.webEvidence).toHaveLength(2);
      expect(result.metadata.researchLatencyMs).toBe(research.latencyMs);
      // Decisão (0,0033) + Etapa 1 (0,002) + verificação (0,28).
      expect(result.metadata.cost).toBeCloseTo(0.2853, 10);
      expect(data.cost).toBeCloseTo(0.2853, 10);
      expect(result.metadata.knowledgeSource).toBe('verify');
    });
  });

  describe('a verificação nunca bloqueia', () => {
    function expectDecisionIntact(result: Awaited<ReturnType<OrchestratorService['analyze']>>) {
      expect(result.output.recommendations.map((rec) => [rec.basis, rec.origin])).toEqual([
        ['model_knowledge', 'model_knowledge'],
        ['model_knowledge', 'model_knowledge'],
        ['model_knowledge', 'model_knowledge'],
        ['model_knowledge', 'model_knowledge'],
      ]);
      expect(
        result.output.recommendations.some((rec) => rec.action.includes('dose na fonte')),
      ).toBe(false);
      expect(result.citations).toEqual([]);
    }

    it('returns the decision output when the research fails', async () => {
      gateway.research.mockRejectedValue(new Error('fetch failed'));

      const result = await service.analyze(physicianId, encounterId, input);

      expectDecisionIntact(result);
      expect(result.output.webEvidence).toEqual([]);
      expect(persisted().data.params).toMatchObject({
        research: { evidenceItems: 0, cost: 0, fallbackReason: 'fetch failed' },
      });
    });

    it('returns the decision output when the link fails, keeping what the research found', async () => {
      gateway.complete.mockImplementation(async (params: CompletionParams) => {
        if (isAttach(params)) throw new Error('overloaded');
        return decisionCompletion();
      });

      const result = await service.analyze(physicianId, encounterId, input);

      expectDecisionIntact(result);
      expect(result.output.webEvidence).toHaveLength(2);
      expect(persisted().data.params).toMatchObject({
        research: { evidenceItems: 2, fallbackReason: 'overloaded' },
      });
    });

    it('does not verify without an understanding of the case', async () => {
      understand.mockResolvedValue(stageOutcome({ understanding: null }));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(gateway.research).not.toHaveBeenCalled();
      expectDecisionIntact(result);
      expect(result.output).not.toHaveProperty('webEvidence');
      expect(persisted().data.params).not.toHaveProperty('research');
    });

    it('does not verify a decision that failed validation', async () => {
      gateway.complete.mockResolvedValue({ ...decisionCompletion(), content: 'não é JSON' });

      await expect(service.analyze(physicianId, encounterId, input)).rejects.toThrow(
        'AI output validation failed',
      );
      expect(gateway.research).not.toHaveBeenCalled();
    });
  });

  describe('analyzeStream', () => {
    it('verifies after the decision deltas and before the final event', async () => {
      gateway.completeStream.mockImplementation(async function* (): AsyncGenerator<
        string,
        StreamCompletionResult
      > {
        const content = decisionOutput();
        calls.push('decide-stream');
        yield content;
        return {
          content,
          model: 'claude-3-sonnet',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
          stopReason: 'end_turn',
        };
      });

      const events: StreamEvent[] = [];
      for await (const event of service.analyzeStream(physicianId, encounterId, input)) {
        if (event.type === 'done') calls.push('done');
        events.push(event);
      }

      expect(events.map((event) => event.type)).toEqual(['understanding', 'delta', 'done']);
      expect(calls).toEqual(['understand', 'decide-stream', 'verify-research', 'attach', 'done']);
      const done = events.at(-1);
      if (done?.type !== 'done') throw new Error('o stream terminou sem evento done');
      expect(done.result.output.webEvidence).toHaveLength(2);
      expect(
        done.result.output.recommendations.find((rec) => rec.citationChunkId === 'web:2'),
      ).toMatchObject({ preliminaryReason: 'source_conflict' });
    });
  });

  describe('continueAnalysis', () => {
    it('verifies the reanalysis too', async () => {
      interactionFindFirst.mockResolvedValue({
        id: 'interaction-parent',
        encounterId,
        turnIndex: 0,
        inputRedacted: caseText,
        answeredQuestions: null,
        params: { demoCase: null, redFlags: {} },
        rawOutput: {
          reasoning: 'Inicial',
          recommendations: [],
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

      const result = await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-parent',
        answers: [{ questionId: 'q-glicemia', answer: '112' }],
      });

      expect(calls).toEqual(['understand', 'decide', 'verify-research', 'attach']);
      expect(result.output.webEvidence).toHaveLength(2);
      expect(persisted().data.params).toMatchObject({ knowledgeSource: 'verify' });
    });
  });
});
