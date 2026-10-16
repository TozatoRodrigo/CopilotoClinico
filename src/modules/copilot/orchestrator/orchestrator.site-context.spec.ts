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
import type { UnderstandingService } from '../understanding/understanding.service';
import type { WebResearchService } from '../research/web-research.service';
import type { EncounterContext } from '../../../shared/contracts/clinical';
import { DECISION_V4_SYSTEM_PROMPT } from './decision-prompt-v4';
import { FACILITY_TRANSFER_RULE_STAGED, FACILITY_TRANSFER_RULE_V1 } from './site-context-prompt';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';

/**
 * CC-602/CC-603 no orquestrador: `COPILOT_SITE_CONTEXT` decide, a cada
 * turno, se a decisão recebe o local de plantão do caso e a regra de
 * transferência. Desligada (o padrão), o pedido ao modelo é o de sempre.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';
const caseText = 'Homem, 70 anos, hemiparesia direita e afasia súbitas há 1 hora. PA 178x96.';

const upaContext: EncounterContext = {
  hasCT: false,
  isSus: true,
  hasLab: true,
  hasICU: false,
  site: {
    siteId: '22222222-2222-4222-8222-222222222222',
    name: 'UPA Centro',
    facilityType: 'upa_porte_1',
    specialists: [],
    referenceTravelMinutes: 90,
    referenceDistanceKm: 60,
  },
};

const transferPlan = JSON.stringify({
  reasoning: 'Déficit focal súbito na janela, sem tomógrafo no serviço.',
  redFlags: [],
  recommendations: [
    {
      action:
        'Regulação imediata para hospital com TC e trombólise (centro de AVC), via SAMU. Prioridade: imediata',
      rationale: 'A reperfusão depende de TC, que este serviço não tem',
      category: 'stabilization',
      layer: 'now',
      dependsOn: null,
      basis: 'model_knowledge',
      citationChunkId: null,
      confidence: 0.9,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
  clarifyingQuestions: [],
});

function completion(content: string) {
  return {
    content,
    model: 'claude-3-sonnet',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    latencyMs: 1500,
  };
}

describe('OrchestratorService — local de plantão (COPILOT_SITE_CONTEXT)', () => {
  let env: Record<string, string>;
  let gateway: { complete: ReturnType<typeof vi.fn>; completeStream: ReturnType<typeof vi.fn> };
  let interactionCreate: ReturnType<typeof vi.fn>;
  let interactionFindFirst: ReturnType<typeof vi.fn>;
  let storedContext: EncounterContext | null;
  let service: OrchestratorService;

  beforeEach(() => {
    env = {
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v4',
      COPILOT_KNOWLEDGE_SOURCE: 'model_only',
    };
    storedContext = upaContext;
    gateway = {
      complete: vi.fn().mockResolvedValue(completion(transferPlan)),
      completeStream: vi.fn(),
    };
    interactionCreate = vi.fn().mockResolvedValue({ id: 'interaction-001' });
    interactionFindFirst = vi.fn();

    const prisma = {
      aiInteraction: { create: interactionCreate, findFirst: interactionFindFirst },
      physician: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const encounters = {
      findById: vi.fn(() =>
        Promise.resolve({
          id: encounterId,
          physicianId,
          patientRef: 'PRN-001',
          institutionId: null,
          context: storedContext,
        }),
      ),
      update: vi.fn().mockResolvedValue({}),
      updateChiefComplaint: vi.fn().mockResolvedValue(undefined),
    };
    const embeddingSearch = vi.fn(() => {
      throw new Error('a busca na base (embedding) não pode rodar aqui');
    });
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
    };
    const understand = vi.fn().mockResolvedValue({
      understanding: understandingFixture(),
      model: 'claude-haiku-5-5',
      usage: { promptTokens: 2000, completionTokens: 400, totalTokens: 2400 },
      cost: 0.002,
      latencyMs: 2100,
    });

    service = new OrchestratorService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      { search: embeddingSearch, searchMany: embeddingSearch } as unknown as RetrievalService,
      { forPrompt: vi.fn().mockResolvedValue([]) } as unknown as AttachmentsService,
      encounters as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      config as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research: vi.fn() } as unknown as WebResearchService,
    );
  });

  function sentMessages(call = 0): ChatMessage[] {
    return (gateway.complete.mock.calls[call]?.[0] as { messages: ChatMessage[] }).messages;
  }

  function persistedParams(call = 0): Record<string, unknown> {
    return (interactionCreate.mock.calls[call]![0] as { data: { params: Record<string, unknown> } })
      .data.params;
  }

  it('is off by default: the site in the case does not reach the decision', async () => {
    await service.analyze(physicianId, encounterId, { caseText, context: upaContext });

    const [system, user] = sentMessages();
    expect(system).toEqual({ role: 'system', content: DECISION_V4_SYSTEM_PROMPT });
    expect(user?.content).not.toContain('facility_context');
    expect(persistedParams()).not.toHaveProperty('siteContext');
  });

  it('on: the decision gets the facility block and the transfer rule, and the trail records it', async () => {
    env = { ...env, COPILOT_SITE_CONTEXT: 'on' };

    await service.analyze(physicianId, encounterId, { caseText, context: upaContext });

    const [system, user] = sentMessages();
    expect(system?.content).toBe(`${DECISION_V4_SYSTEM_PROMPT}${FACILITY_TRANSFER_RULE_STAGED}`);
    expect(user?.content).toContain('Local do atendimento: UPA 24h porte I.');
    expect(user?.content).toContain('NÃO tem no local: tomografia, UTI.');
    expect(user?.content).not.toContain('UPA Centro');
    expect(persistedParams()).toMatchObject({ siteContext: true });
  });

  it('on, without a declared site: the prompt of always (unmarked is not missing)', async () => {
    env = { ...env, COPILOT_SITE_CONTEXT: 'on' };
    const { site: _site, ...resourcesOnly } = upaContext;

    await service.analyze(physicianId, encounterId, { caseText, context: resourcesOnly });

    expect(sentMessages()[0]?.content).toBe(DECISION_V4_SYSTEM_PROMPT);
    expect(persistedParams()).not.toHaveProperty('siteContext');
  });

  it('a typo in the flag keeps it off', async () => {
    env = { ...env, COPILOT_SITE_CONTEXT: 'ligado' };

    await service.analyze(physicianId, encounterId, { caseText, context: upaContext });

    expect(sentMessages()[0]?.content).toBe(DECISION_V4_SYSTEM_PROMPT);
  });

  it('on, legacy v1: the v1 transfer rule closes the system prompt', async () => {
    env = { COPILOT_SITE_CONTEXT: 'on', COPILOT_KNOWLEDGE_SOURCE: 'model_only' };
    gateway.complete.mockResolvedValue(
      completion(
        JSON.stringify({
          reasoning: 'Sem diretriz.',
          recommendations: [],
          uncertainty: true,
          uncertaintyReason: 'Sem diretriz',
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Qual o horário do último momento visto bem?',
              why: 'Janela',
              criticality: 'blocker',
              expectedAnswerType: 'text',
            },
          ],
        }),
      ),
    );

    await service.analyze(physicianId, encounterId, { caseText, context: upaContext });

    const [system, user] = sentMessages();
    expect(system?.content.endsWith(FACILITY_TRANSFER_RULE_V1)).toBe(true);
    expect(user?.content).toContain('NÃO tem no local: tomografia, UTI.');
  });

  it('on: a reanalysis reads the site stored in the case', async () => {
    env = { ...env, COPILOT_SITE_CONTEXT: 'on' };
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
        clarifyingQuestions: [{ id: 'q-uvb', question: 'Último momento visto bem?' }],
      },
    });

    await service.continueAnalysis(physicianId, encounterId, {
      interactionId: 'interaction-parent',
      answers: [{ questionId: 'q-uvb', answer: 'Há 1 hora' }],
    });

    expect(sentMessages()[1]?.content).toContain('NÃO tem no local: tomografia, UTI.');
    expect(persistedParams()).toMatchObject({ siteContext: true });
  });

  it('on: a stored site out of shape is dropped and the reanalysis keeps the prompt of always', async () => {
    env = { ...env, COPILOT_SITE_CONTEXT: 'on' };
    storedContext = { ...upaContext, site: { name: 'UPA' } as unknown as EncounterContext['site'] };
    interactionFindFirst.mockResolvedValue({
      id: 'interaction-parent',
      encounterId,
      turnIndex: 0,
      inputRedacted: caseText,
      answeredQuestions: null,
      params: { demoCase: null, redFlags: {} },
      rawOutput: { reasoning: 'Inicial', recommendations: [], clarifyingQuestions: [] },
    });

    await service.continueAnalysis(physicianId, encounterId, {
      interactionId: 'interaction-parent',
      answers: [{ questionId: 'q-uvb', answer: 'Há 1 hora' }],
    });

    expect(sentMessages()[0]?.content).toBe(DECISION_V4_SYSTEM_PROMPT);
    expect(sentMessages()[1]?.content).not.toContain('facility_context');
  });
});
