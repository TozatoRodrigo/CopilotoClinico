import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { OrchestratorService } from './orchestrator.service';
import type { PrismaService } from '../../../config/prisma.service';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type { ChatMessage } from '../../ai-gateway/providers/provider.interface';
import type { RetrievalService } from '../retrieval/retrieval.service';
import type { EncountersService } from '../../encounters/encounters.service';
import type { AttachmentsService } from '../../encounters/attachments/attachments.service';
import type { AuditService } from '../../audit/audit.service';
import type {
  UnderstandingOutcome,
  UnderstandingService,
} from '../understanding/understanding.service';
import type { WebResearchService } from '../research/web-research.service';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * CC-333 — escores pelo motor no orquestrador. Com
 * `COPILOT_DETERMINISTIC_SCORES` desligada (padrão), o prompt e a saída ficam
 * byte a byte iguais aos de antes da flag: as impressões digitais abaixo
 * foram gravadas no código anterior a ela.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';

/** Pneumonia com tudo o que o CURB-65 pede: o motor dá 5, o modelo escreveu 3. */
const caseText =
  'Mulher, 72 anos, febre e tosse produtiva há 3 dias, confusa e desorientada. FR 32 irpm, PA 85x50 mmHg, FC 118 bpm, SpO2 89% em ar ambiente, Tax 38,9. Ureia 64 mg/dL.';
const input = {
  caseText,
  context: { hasCT: true, isSus: true, hasLab: true, hasICU: true },
};

const pneumonia = understandingFixture({
  problemRepresentation:
    'Idosa de 72 anos com febre, tosse produtiva e confusão nova, hipotensa e taquipneica.',
  structuredData: {
    age: 72,
    sex: 'F',
    vitals: {
      systolicBp: 85,
      diastolicBp: 50,
      heartRate: 118,
      respiratoryRate: 32,
      spo2: 89,
      temperature: 38.9,
      glucose: null,
    },
    onset: 'há 3 dias',
    keyFindings: ['tosse produtiva', 'confusão mental nova'],
    relevantContext: [],
  },
  instability: { present: true, findings: ['hipotensão', 'taquipneia'] },
  syndrome: 'infeccao-respiratoria',
  cannotMiss: [
    {
      hypothesis: 'Sepse de foco pulmonar',
      whyPlausible: 'Febre, hipotensão e confusão',
      confirmOrRuleOut: 'Lactato e hemoculturas',
    },
  ],
  likely: [{ hypothesis: 'Pneumonia adquirida na comunidade', why: 'Febre e tosse produtiva' }],
  missingDiscriminators: [],
  searchQueries: ['pneumonia grave sepse'],
  timeCritical: true,
});

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    action: 'Internação em UTI (CURB-65 de 3 pontos)',
    rationale: 'qSOFA 2 com hipotensão e taquipneia',
    category: 'stabilization',
    layer: 'now',
    dependsOn: null,
    basis: 'model_knowledge',
    citationChunkId: null,
    confidence: 0.9,
    ...overrides,
  };
}

function v3Output(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reasoning: 'Pneumonia grave com sepse provável: CURB-65 de 3 e qSOFA 2.',
    redFlags: [],
    recommendations: [
      recommendation(),
      recommendation({
        action: 'Antibiótico IV na primeira hora após hemoculturas',
        rationale: 'Sepse de foco pulmonar',
        category: 'therapeutic',
      }),
    ],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
    ...overrides,
  });
}

function v1Output(): string {
  return JSON.stringify({
    reasoning: 'Pneumonia grave: CURB-65 de 3.',
    redFlags: [],
    recommendations: [
      {
        action: 'Internação em UTI (CURB-65 de 3 pontos)',
        rationale: 'qSOFA 2 com hipotensão',
        citationChunkId: 'chunk-pac',
        confidence: 0.9,
        category: 'stabilization',
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
  });
}

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
    understanding: pneumonia,
    model: 'claude-haiku-5-5',
    usage: { promptTokens: 2000, completionTokens: 400, totalTokens: 2400 },
    cost: 0.002,
    latencyMs: 2100,
    ...overrides,
  };
}

const retrievalResult = {
  chunks: [
    {
      id: 'chunk-pac',
      text: 'Pneumonia grave: internação em UTI.',
      source: 'diretriz-pac',
      sourceVersion: '1.0',
      specialty: 'pneumologia',
      evidenceLevel: 'A',
      institutionId: null,
      score: 0.03,
      metadata: {},
      clinicallySigned: true,
    },
  ],
  totalRetrieved: 1,
  coverage: 'full',
  bestSemanticScore: 0.7,
  discardedByFloor: 0,
  official: { enabled: true, chunks: [], bestSemanticScore: 0, discardedByFloor: 0 },
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('OrchestratorService — escores pelo motor (CC-333)', () => {
  let env: Record<string, string>;
  let understand: ReturnType<typeof vi.fn>;
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
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
    };
    const retrieval = {
      search: vi.fn().mockResolvedValue(retrievalResult),
      searchMany: vi.fn().mockResolvedValue(retrievalResult),
    };

    service = new OrchestratorService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      retrieval as unknown as RetrievalService,
      { forPrompt: vi.fn().mockResolvedValue([]) } as unknown as AttachmentsService,
      encounters as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      config as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research: vi.fn() } as unknown as WebResearchService,
    );
  });

  function sentMessages(call = 0): ChatMessage[] {
    const params = gateway.complete.mock.calls[call]?.[0] as { messages: ChatMessage[] };
    return params.messages;
  }

  /** Reanálise no último turno: a instrução de último turno também vai no fim do prompt. */
  function finalTurnParent() {
    interactionFindFirst.mockResolvedValue({
      id: 'interaction-000',
      encounterId,
      turnIndex: 3,
      inputRedacted: caseText,
      answeredQuestions: null,
      params: { demoCase: null, redFlags: {} },
      rawOutput: { clarifyingQuestions: [{ id: 'q-1', question: 'Qual a ureia?' }] },
    });
    env.COPILOT_MAX_TURNS = '5';
  }

  // Gravadas no código anterior à flag (base feat/ferramentas-no-plano,
  // fc1129f6). Se um destes hashes mudar com a flag desligada, o prompt ou a
  // saída mudou para quem não ligou a flag.
  const FINGERPRINTS = {
    v3: {
      messages: '86c6b0f3351cceed94efdd886f53ad67b87db71baaa8a556cf335994123f9ec3',
      output: '9c0c8c2f0c23efce209dae6363492ecca6466695863bb928c41266570d3157f3',
    },
    legacy: {
      messages: '63ab5bcfdb83382d0b2d54fb6654dc2a03381d9c62adaf9876e36cc3ffa36b5e',
      output: '39ee560b7249067269b07b099ea0e09c9b1f2f7afb98e49f835e3450aa2eb894',
    },
    finalTurn: {
      messages: '97abdfe09ddf9016927757afa4c6e9f846a3cb7fef237eb7408ed45b01369cfe',
      output: '9c0c8c2f0c23efce209dae6363492ecca6466695863bb928c41266570d3157f3',
    },
  };

  describe('flag desligada: prompt e saída byte a byte iguais aos de antes', () => {
    it.each([
      ['ausente', undefined],
      ['off', 'off'],
      ['com typo', 'ligado'],
    ])('decisão v3 com a flag %s', async (_label, value) => {
      if (value !== undefined) env.COPILOT_DETERMINISTIC_SCORES = value;

      const result = await service.analyze(physicianId, encounterId, input);

      expect(sha256(sentMessages())).toBe(FINGERPRINTS.v3.messages);
      expect(sha256(result.output)).toBe(FINGERPRINTS.v3.output);
      expect(result.output).not.toHaveProperty('deterministicScores');
      expect(result.output.recommendations[0]?.action).toBe(
        'Internação em UTI (CURB-65 de 3 pontos)',
      );
    });

    it('legacy (decisão v1, sem entendimento)', async () => {
      env = {};
      gateway.complete.mockResolvedValue(completion(v1Output()));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(sha256(sentMessages())).toBe(FINGERPRINTS.legacy.messages);
      expect(sha256(result.output)).toBe(FINGERPRINTS.legacy.output);
    });

    it('reanálise no último turno, com a instrução de último turno', async () => {
      finalTurnParent();

      const result = await service.continueAnalysis(physicianId, encounterId, {
        interactionId: 'interaction-000',
        answers: [{ questionId: 'q-1', answer: 'Ureia 64 mg/dL' }],
      });

      expect(sha256(sentMessages())).toBe(FINGERPRINTS.finalTurn.messages);
      expect(sha256(result.output)).toBe(FINGERPRINTS.finalTurn.output);
    });
  });
});
