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
import type { WebResearchService } from '../research/web-research.service';
import type {
  ApplicableCardsResult,
  ReviewedCardRetrievalService,
} from '../../knowledge-cards/card-retrieval/reviewed-card-retrieval.service';
import { understandingFixture } from '../../../../tests/fixtures/case-understanding';
import {
  REVIEWED_CARD_ID,
  REVIEWED_VERSION_ID,
  REVIEWER_ID,
  reviewedCard,
} from '../../../../tests/fixtures/reviewed-cards';

/**
 * CC-408 (ADR-019) — cartões revisados na decisão em etapas: com a flag
 * desligada nada muda; ligada, o cartão aplicável entra no prompt com
 * autoria, a conduta que o cita sai com origem `reviewed_card` e "Revisado
 * por", e a dose que o cartão não dá é corrigida ou perde a citação.
 */

const physicianId = 'phys-001';
const encounterId = 'enc-001';
const input = {
  caseText: 'Homem, 45 anos, febre, cefaleia intensa e rigidez de nuca há 12 horas. PA 118x72.',
  context: { hasCT: true, isSus: true, hasLab: true, hasICU: false },
};

const understanding = understandingFixture({
  problemRepresentation: 'Homem de 45 anos com febre, cefaleia e rigidez de nuca há 12 horas.',
  syndrome: 'febre',
  cannotMiss: [
    {
      hypothesis: 'Meningite bacteriana',
      whyPlausible: 'Febre, cefaleia e rigidez de nuca',
      confirmOrRuleOut: 'Punção lombar',
    },
  ],
  likely: [{ hypothesis: 'Meningite viral', why: 'Quadro agudo febril' }],
  missingDiscriminators: [],
  searchQueries: ['meningite bacteriana antibiótico empírico adulto', 'meningite manejo inicial'],
});

const CARD_DOSE_ACTION = 'Ceftriaxona 2 g IV a cada 12 horas, logo após a coleta do líquor';

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    action: CARD_DOSE_ACTION,
    rationale: 'Antibiótico empírico da meningite bacteriana no adulto',
    category: 'therapeutic',
    layer: 'now',
    dependsOn: null,
    basis: 'source',
    citationChunkId: 'card:1',
    confidence: 0.9,
    ...overrides,
  };
}

const destination = {
  action: 'Sala de emergência com monitorização e isolamento respiratório',
  rationale: 'Meningite bacteriana suspeita',
  category: 'stabilization',
  layer: 'now',
  dependsOn: null,
  basis: 'model_knowledge',
  citationChunkId: null,
  confidence: 0.9,
};

function decision(recommendations: unknown[]): string {
  return JSON.stringify({
    reasoning: 'Meningite bacteriana até prova em contrário: antibiótico sem esperar o líquor.',
    redFlags: [],
    recommendations,
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
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

async function* fakeStream(content: string): AsyncGenerator<string, StreamCompletionResult> {
  yield content.slice(0, 20);
  yield content.slice(20);
  return {
    content,
    model: 'claude-3-sonnet',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    stopReason: 'end_turn',
  };
}

function stageOutcome(overrides: Partial<UnderstandingOutcome> = {}): UnderstandingOutcome {
  return {
    understanding,
    model: 'claude-haiku-5-5',
    usage: { promptTokens: 2000, completionTokens: 400, totalTokens: 2400 },
    cost: 0.002,
    latencyMs: 2100,
    ...overrides,
  };
}

function applicable(): ApplicableCardsResult {
  return {
    cards: [{ card: reviewedCard(), similarity: 0.83 }],
    trace: {
      status: 'ok',
      gate: 'similarity-theme',
      candidates: 2,
      accepted: 1,
      rejected: { syndrome_mismatch: 1 },
    },
  };
}

describe('OrchestratorService — cartões revisados na decisão (CC-408)', () => {
  let env: Record<string, string>;
  let understand: ReturnType<typeof vi.fn>;
  let findApplicable: ReturnType<typeof vi.fn>;
  let gateway: { complete: ReturnType<typeof vi.fn>; completeStream: ReturnType<typeof vi.fn> };
  let interactionCreate: ReturnType<typeof vi.fn>;
  let service: OrchestratorService;

  beforeEach(() => {
    env = {
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v3',
      COPILOT_KNOWLEDGE_SOURCE: 'model_only',
      COPILOT_REVIEWED_CARDS: 'on',
    };
    understand = vi.fn().mockResolvedValue(stageOutcome());
    findApplicable = vi.fn().mockResolvedValue(applicable());
    gateway = {
      complete: vi.fn().mockResolvedValue(completion(decision([recommendation(), destination]))),
      completeStream: vi.fn(() => fakeStream(decision([recommendation(), destination]))),
    };
    interactionCreate = vi.fn().mockResolvedValue({ id: 'interaction-001' });

    const forbidden = (what: string) =>
      vi.fn(() => {
        throw new Error(`${what} não roda em model_only`);
      });
    service = new OrchestratorService(
      {
        aiInteraction: { create: interactionCreate },
        physician: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      {
        search: forbidden('a busca'),
        searchMany: forbidden('a busca'),
      } as unknown as RetrievalService,
      { forPrompt: vi.fn().mockResolvedValue([]) } as unknown as AttachmentsService,
      {
        findById: vi.fn().mockResolvedValue({
          id: encounterId,
          physicianId,
          patientRef: 'PRN-001',
          institutionId: 'inst-1',
          context: input.context,
        }),
        update: vi.fn().mockResolvedValue({}),
        updateChiefComplaint: vi.fn().mockResolvedValue(undefined),
      } as unknown as EncountersService,
      { log: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as unknown as AuditService,
      {
        get: vi.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
      } as unknown as ConfigService,
      { understand } as unknown as UnderstandingService,
      { research: forbidden('a pesquisa web') } as unknown as WebResearchService,
      { findApplicable } as unknown as ReviewedCardRetrievalService,
    );
  });

  function messages(call = 0): ChatMessage[] {
    return (gateway.complete.mock.calls[call]![0] as { messages: ChatMessage[] }).messages;
  }

  function persisted(call = 0) {
    return interactionCreate.mock.calls[call]![0] as {
      data: { params: Record<string, unknown>; rawOutput: Record<string, unknown> };
    };
  }

  describe('flag desligada', () => {
    beforeEach(() => {
      delete env.COPILOT_REVIEWED_CARDS;
    });

    it('não busca cartão, e prompt e saída não ganham nada', async () => {
      gateway.complete.mockResolvedValue(completion(decision([destination])));

      const result = await service.analyze(physicianId, encounterId, input);

      expect(findApplicable).not.toHaveBeenCalled();
      expect(messages()[1]!.content).not.toContain('reviewed_cards');
      expect(result.output).not.toHaveProperty('reviewedCards');
      expect(persisted().data.params).not.toHaveProperty('reviewedCards');
      expect(persisted().data.rawOutput).not.toHaveProperty('reviewedCards');
    });

    it('o prompt é o mesmo de uma análise com a flag ligada e nenhum cartão aplicável', async () => {
      gateway.complete.mockResolvedValue(completion(decision([destination])));
      await service.analyze(physicianId, encounterId, input);
      const off = messages(0);

      env.COPILOT_REVIEWED_CARDS = 'on';
      findApplicable.mockResolvedValue({ ...applicable(), cards: [] });
      await service.analyze(physicianId, encounterId, input);

      expect(messages(1)).toEqual(off);
    });
  });

  it('busca pelo entendimento do caso — nunca pelo texto — na instituição do atendimento', async () => {
    await service.analyze(physicianId, encounterId, input);

    expect(findApplicable).toHaveBeenCalledWith({
      queries: understanding.searchQueries,
      institutionId: 'inst-1',
      syndrome: 'febre',
      hypotheses: ['Meningite bacteriana', 'Meningite viral'],
      problemRepresentation: understanding.problemRepresentation,
    });
    expect(JSON.stringify(findApplicable.mock.calls[0])).not.toContain('PA 118x72');
  });

  it('entrega o cartão com autoria e mostra a conduta com a dose do cartão e "Revisado por"', async () => {
    const result = await service.analyze(physicianId, encounterId, input);

    expect(messages()[1]!.content).toContain(
      '[ID: card:1] [Revisado por Dr(a). Ana Souza, CRM 123456/SP, em 12/10/2026 — versão 2]',
    );
    // Estabilização vem antes da terapêutica na ordem do plano.
    const [destinationRec, cardRec] = result.output.recommendations;
    expect(cardRec).toMatchObject({
      action: CARD_DOSE_ACTION,
      basis: 'source',
      citationChunkId: 'card:1',
      origin: 'reviewed_card',
      preliminary: false,
      source: 'Cartão revisado — Meningite bacteriana',
      sourceVersion: 'v2',
      sourceUrl: `/cartoes/${REVIEWED_CARD_ID}`,
      reviewedCard: {
        cardId: REVIEWED_CARD_ID,
        version: 2,
        reviewer: { name: 'Ana Souza', crmNumber: '123456', crmUf: 'SP' },
        reviewedAt: '2026-10-12T15:00:00.000Z',
      },
    });
    expect(cardRec).not.toHaveProperty('preliminaryReason');
    expect(destinationRec).toMatchObject({ origin: 'model_knowledge' });
    expect(destinationRec).not.toHaveProperty('reviewedCard');
    expect(result.citations).toEqual([
      expect.objectContaining({ chunkId: 'card:1', origin: 'reviewed_card' }),
    ]);
  });

  it('grava na trilha os cartões entregues e o que a busca e o portão fizeram', async () => {
    await service.analyze(physicianId, encounterId, input);

    expect(persisted().data.rawOutput.reviewedCards).toEqual([
      {
        citationId: 'card:1',
        cardId: REVIEWED_CARD_ID,
        versionId: REVIEWED_VERSION_ID,
        version: 2,
        contentSha256: reviewedCard().contentSha256,
        reviewerId: REVIEWER_ID,
        similarity: 0.83,
      },
    ]);
    expect(persisted().data.params.reviewedCards).toEqual(applicable().trace);
  });

  it('dose que o cartão não dá vale um retry com a dose do cartão no feedback', async () => {
    gateway.complete
      .mockResolvedValueOnce(
        completion(decision([recommendation({ action: 'Ceftriaxona 1 g IV a cada 12 horas' })])),
      )
      .mockResolvedValueOnce(completion(decision([recommendation(), destination])));

    const result = await service.analyze(physicianId, encounterId, input);

    expect(gateway.complete).toHaveBeenCalledTimes(2);
    expect(messages(1).at(-1)!.content).toContain('CARD DOSE NOT IN CARD');
    expect(result.output.recommendations[1]).toMatchObject({ origin: 'reviewed_card' });
  });

  it('se a dose fora do cartão sobra depois do retry, a conduta perde a citação e sai marcada', async () => {
    const wrongDose = decision([
      recommendation({ action: 'Ceftriaxona 1 g IV a cada 12 horas' }),
      destination,
    ]);
    gateway.complete.mockResolvedValue(completion(wrongDose));

    const result = await service.analyze(physicianId, encounterId, input);

    const demoted = result.output.recommendations.find((rec) => rec.action.includes('1 g'));
    expect(demoted).toMatchObject({
      basis: 'model_knowledge',
      citationChunkId: null,
      origin: 'model_knowledge',
      preliminary: true,
      preliminaryReason: 'unverified_dose',
    });
    expect(demoted).not.toHaveProperty('reviewedCard');
    expect(result.citations).toEqual([]);
  });

  it('na decisão v1 o cartão não entra: só a decisão em etapas cita por id', async () => {
    env = { COPILOT_REVIEWED_CARDS: 'on', COPILOT_KNOWLEDGE_SOURCE: 'model_only' };
    gateway.complete.mockResolvedValue(
      completion(
        JSON.stringify({
          reasoning: 'Sem evidência.',
          recommendations: [],
          uncertainty: true,
          uncertaintyReason: 'Sem diretriz',
          differentials: [],
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

    expect(findApplicable).not.toHaveBeenCalled();
    expect(persisted().data.params).not.toHaveProperty('reviewedCards');
  });

  it('sem entendimento do caso, não busca cartão', async () => {
    understand.mockResolvedValue(stageOutcome({ understanding: null }));
    gateway.complete.mockResolvedValue(completion(decision([destination])));

    await service.analyze(physicianId, encounterId, input);

    expect(findApplicable).not.toHaveBeenCalled();
    expect(persisted().data.params.reviewedCards).toEqual({
      status: 'no_understanding',
      candidates: 0,
      accepted: 0,
    });
  });

  it('busca de cartão que falha não derruba a análise', async () => {
    findApplicable.mockRejectedValue(new Error('db down'));
    gateway.complete.mockResolvedValue(completion(decision([destination])));

    const result = await service.analyze(physicianId, encounterId, input);

    expect(result.output.recommendations).toHaveLength(1);
    expect(messages()[1]!.content).not.toContain('reviewed_cards');
    expect(persisted().data.params.reviewedCards).toMatchObject({ status: 'retrieval_failed' });
  });

  it('o streaming entrega o mesmo cartão e o mesmo "Revisado por"', async () => {
    const events: StreamEvent[] = [];
    for await (const event of service.analyzeStream(physicianId, encounterId, input)) {
      events.push(event);
    }

    const done = events.find((event) => event.type === 'done');
    expect(done?.type === 'done' && done.result.output.recommendations[1]).toMatchObject({
      origin: 'reviewed_card',
      reviewedCard: { cardId: REVIEWED_CARD_ID },
    });
    const streamed = gateway.completeStream.mock.calls[0]![0] as { messages: ChatMessage[] };
    expect(streamed.messages[1]!.content).toContain('<reviewed_cards');
  });
});
