import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiRefusalError } from '../../ai-gateway/ai-gateway.errors';
import type { CompletionParams } from '../../ai-gateway/providers/provider.interface';
import type { AuditService } from '../../audit/audit.service';
import { sha256Hex } from '../../audit/audit-hash';
import type { GuidelinesService } from '../../guidelines/guidelines.service';
import type { PrismaService } from '../../../config/prisma.service';
import {
  DIAGNOSIS_CHUNK_ID,
  DIAGNOSIS_TEXT,
  sourceChunk,
  sourceChunks,
  TREATMENT_CHUNK_ID,
  TREATMENT_TEXT,
  validCardInput,
} from '../../../../tests/fixtures/knowledge-cards';
import { sourceContentSha256 } from '../domain/draft-provenance';
import { KnowledgeCardDraftService, type CardDraftRequest } from './card-draft.service';
import { CARD_DRAFT_JSON_SCHEMA, CARD_DRAFT_SYSTEM_PROMPT } from './card-draft-prompt';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const INSTITUTION_ID = '77777777-7777-4777-8777-777777777777';

/** O cartão como o modelo devolve: sem `sources` (o servidor resolve). */
function draftedCard() {
  const { sources: _sources, ...card } = validCardInput();
  return card;
}

function completion(cards: unknown[], model = 'claude-sonnet-5-5') {
  return {
    content: JSON.stringify({ cards }),
    model,
    // 10 mil tokens de entrada × $2 + mil de saída × $10, por milhão = 0,03.
    usage: { promptTokens: 10_000, completionTokens: 1_000, totalTokens: 11_000 },
    latencyMs: 5_000,
  };
}

function createPrisma() {
  const chunks = sourceChunks();
  const prisma = {
    guidelineChunk: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) => {
          const chunk = chunks.get(id);
          return chunk ? [chunk] : [];
        }),
      ),
    },
    institution: { findUnique: vi.fn().mockResolvedValue({ id: INSTITUTION_ID }) },
    knowledgeCardDraft: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date('2026-10-14T12:00:00Z'),
      })),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    knowledgeCard: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => ({ id: data.id })),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => unknown) =>
    run(prisma),
  );
  return { prisma, chunks };
}

describe('KnowledgeCardDraftService', () => {
  let prisma: ReturnType<typeof createPrisma>['prisma'];
  let chunks: ReturnType<typeof createPrisma>['chunks'];
  let gateway: { complete: ReturnType<typeof vi.fn> };
  let guidelines: { consult: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let env: Record<string, string>;
  let service: KnowledgeCardDraftService;

  const request = (overrides: Partial<CardDraftRequest> = {}): CardDraftRequest => ({
    topic: 'Meningite bacteriana: antibiótico empírico no adulto',
    syndrome: 'febre',
    institutionId: null,
    chunkIds: [TREATMENT_CHUNK_ID, DIAGNOSIS_CHUNK_ID],
    requestedBy: ADMIN_ID,
    submitForReview: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    ({ prisma, chunks } = createPrisma());
    gateway = { complete: vi.fn().mockResolvedValue(completion([draftedCard()])) };
    guidelines = { consult: vi.fn().mockResolvedValue([]) };
    audit = { log: vi.fn().mockResolvedValue({}) };
    env = { KNOWLEDGE_CARDS_DRAFT_ENABLED: 'true', AI_MODEL: 'claude-opus-5-5' };
    service = new KnowledgeCardDraftService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      guidelines as unknown as GuidelinesService,
      audit as unknown as AuditService,
      new ConfigService(env),
    );
  });

  function draftRow() {
    const [call] = prisma.knowledgeCardDraft.create.mock.calls;
    return call?.[0].data as Record<string, unknown>;
  }

  function createdCards() {
    return prisma.knowledgeCard.create.mock.calls.map(
      ([arg]) =>
        (
          arg as unknown as {
            data: Record<string, unknown> & { versions: { create: Record<string, unknown> } };
          }
        ).data,
    );
  }

  it('fica desligado sem a flag: nem chama o modelo nem grava', async () => {
    delete env.KNOWLEDGE_CARDS_DRAFT_ENABLED;

    await expect(service.draft(request())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('pede os cartões na etapa card_draft, com o schema e os trechos numerados', async () => {
    await service.draft(request());

    const params = gateway.complete.mock.calls[0]?.[0] as CompletionParams;
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      effort: 'medium',
      stage: 'card_draft',
      responseSchema: CARD_DRAFT_JSON_SCHEMA,
    });
    expect(params.messages[0]).toEqual({ role: 'system', content: CARD_DRAFT_SYSTEM_PROMPT });
    expect(params.messages[1]?.content).toContain(
      `[S1] PCDT · Meningite bacteriana · 7. TRATAMENTO`,
    );
    expect(params.messages[1]?.content).toContain(
      `[S2] PCDT · Meningite bacteriana · 6. DIAGNÓSTICO`,
    );
  });

  it('usa AI_CARD_DRAFT_MODEL quando configurado', async () => {
    env.AI_CARD_DRAFT_MODEL = 'groq:openai/gpt-oss-120b';

    await service.draft(request());

    expect(gateway.complete.mock.calls[0]?.[0]).toMatchObject({
      model: 'groq:openai/gpt-oss-120b',
    });
    expect(draftRow().requestedModel).toBe('groq:openai/gpt-oss-120b');
  });

  it('grava o cartão que passa na checagem em revisão, com a origem do rascunho', async () => {
    const result = await service.draft(request());

    expect(result.draft).toMatchObject({
      status: 'completed',
      cardsAccepted: 1,
      cardsRejected: 0,
      requestedModel: 'claude-opus-5-5',
      servedModel: 'claude-sonnet-5-5',
      promptSha256: sha256Hex(CARD_DRAFT_SYSTEM_PROMPT),
      sourceContentSha256: sourceContentSha256([TREATMENT_TEXT, DIAGNOSIS_TEXT]),
      sourceChunkIds: [TREATMENT_CHUNK_ID, DIAGNOSIS_CHUNK_ID],
      costUsd: 0.03,
    });
    const [card] = createdCards();
    expect(result.cardIds).toEqual([card?.id]);
    expect(card).toMatchObject({
      status: 'in_review',
      topic: 'Meningite bacteriana: antibiótico empírico no adulto',
      syndrome: 'febre',
      institutionId: null,
      currentVersion: 1,
    });
    expect(card?.versions.create).toMatchObject({
      version: 1,
      authorKind: 'ai',
      draftId: result.draft.id,
      contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('registra CARD_DRAFTED na trilha, sem texto do cartão', async () => {
    const result = await service.draft(request());

    const version = createdCards()[0]?.versions.create;
    expect(audit.log).toHaveBeenCalledWith({
      actorId: ADMIN_ID,
      action: 'CARD_DRAFTED',
      entity: 'KnowledgeCard',
      entityId: result.cardIds[0],
      payload: {
        draftId: result.draft.id,
        version: 1,
        contentSha256: version?.contentSha256,
        status: 'in_review',
      },
    });
  });

  it('deixa o cartão em rascunho quando o pedido não envia para revisão', async () => {
    await service.draft(request({ submitForReview: false }));

    expect(createdCards()[0]?.status).toBe('draft');
  });

  it('lista como fontes do cartão só os trechos que ele cita', async () => {
    const onlyTreatment = draftedCard();
    onlyTreatment.claims = onlyTreatment.claims.slice(0, 1);
    gateway.complete.mockResolvedValue(completion([onlyTreatment]));

    await service.draft(request());

    const content = createdCards()[0]?.versions.create.content as {
      sources: Array<{ key: string; chunkId: string }>;
    };
    expect(content.sources.map((source) => [source.key, source.chunkId])).toEqual([
      ['S1', TREATMENT_CHUNK_ID],
    ]);
  });

  it('rejeita antes da revisão o cartão com citação inventada ou dose sem fonte (CC-403)', async () => {
    const invented = draftedCard();
    invented.answerCitations = [
      { sourceKey: 'S1', quote: 'Ceftriaxona 2 g IV de 12 em 12 horas no adulto' },
    ];
    const unsourcedDose = draftedCard();
    unsourcedDose.answer = 'Ceftriaxona 1 g IV a cada 12 horas, logo após a coleta do líquor.';
    gateway.complete.mockResolvedValue(completion([draftedCard(), invented, unsourcedDose]));

    const result = await service.draft(request());

    expect(result.draft.cardsAccepted).toBe(1);
    expect(result.cardIds).toHaveLength(1);
    expect(result.draft.rejections).toEqual([
      {
        index: 1,
        question: invented.question,
        issues: [
          {
            path: 'answerCitations[0].quote',
            message: 'trecho citado não encontrado no texto da fonte S1',
          },
        ],
      },
      {
        index: 2,
        question: unsourcedDose.question,
        issues: [{ path: 'answer', message: 'dose sem fonte: "1 g" não está no trecho citado' }],
      },
    ]);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('rejeita o cartão fora do formato sem derrubar os outros', async () => {
    gateway.complete.mockResolvedValue(
      completion([{ ...draftedCard(), question: 'Dose?', population: '' }, draftedCard()]),
    );

    const result = await service.draft(request());

    expect(result.draft.cardsAccepted).toBe(1);
    expect(result.draft.rejections[0]).toMatchObject({
      index: 0,
      issues: [{ path: 'question' }],
    });
  });

  it('rejeita o que passa do teto de cartões por rascunho', async () => {
    gateway.complete.mockResolvedValue(completion(Array.from({ length: 4 }, draftedCard)));

    const result = await service.draft(request());

    expect(result.draft.cardsAccepted).toBe(3);
    expect(result.draft.rejections).toEqual([
      {
        index: 3,
        question: draftedCard().question,
        issues: [{ path: '', message: 'acima do teto de 3 cartões por rascunho' }],
      },
    ]);
  });

  it('grava o rascunho como falho quando a resposta não é JSON do schema', async () => {
    gateway.complete.mockResolvedValue({ ...completion([]), content: 'não sei' });

    const result = await service.draft(request());

    expect(result.draft).toMatchObject({
      status: 'failed',
      failureReason: 'o rascunho não veio em JSON',
      cardsAccepted: 0,
      costUsd: 0.03,
    });
    expect(prisma.knowledgeCard.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('conta o custo da recusa do modelo', async () => {
    gateway.complete.mockRejectedValue(
      new AiRefusalError({
        model: 'claude-sonnet-5-5',
        category: 'bio',
        explanation: null,
        usage: { promptTokens: 10_000, completionTokens: 1_000, totalTokens: 11_000 },
      }),
    );

    const result = await service.draft(request());

    expect(result.draft).toMatchObject({
      status: 'failed',
      servedModel: 'claude-sonnet-5-5',
      costUsd: 0.03,
    });
    expect(result.draft.failureReason).toMatch(/refused/);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('manda erro de provedor para o Sentry, sem a mensagem no registro', async () => {
    const error = new TypeError('fetch failed: chave sk-123');
    gateway.complete.mockRejectedValue(error);

    const result = await service.draft(request());

    expect(result.draft).toMatchObject({
      status: 'failed',
      failureReason: 'erro do provedor: TypeError',
      costUsd: 0,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('recusa trecho que não pode ser fonte sem chamar o modelo', async () => {
    chunks.set(TREATMENT_CHUNK_ID, sourceChunk({ status: 'pending_review' }));

    await expect(service.draft(request())).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('recusa trecho de outra instituição como inexistente (ADR-009)', async () => {
    chunks.set(TREATMENT_CHUNK_ID, sourceChunk({ institutionId: INSTITUTION_ID }));

    const error = await service.draft(request()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      issues: [{ path: 'chunkIds[0]', message: 'trecho de diretriz não encontrado' }],
    });
  });

  it('aceita trecho da própria instituição num cartão institucional', async () => {
    chunks.set(TREATMENT_CHUNK_ID, sourceChunk({ institutionId: INSTITUTION_ID }));

    await service.draft(request({ institutionId: INSTITUTION_ID }));

    expect(createdCards()[0]?.institutionId).toBe(INSTITUTION_ID);
  });

  it('recusa instituição inexistente', async () => {
    prisma.institution.findUnique.mockResolvedValue(null);

    await expect(service.draft(request({ institutionId: INSTITUTION_ID }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sem trechos, escolhe pela consulta de diretrizes com o tema', async () => {
    guidelines.consult.mockResolvedValue([
      { chunkId: TREATMENT_CHUNK_ID },
      { chunkId: DIAGNOSIS_CHUNK_ID },
    ]);

    await service.draft(request({ chunkIds: undefined }));

    expect(guidelines.consult).toHaveBeenCalledWith(
      'Meningite bacteriana: antibiótico empírico no adulto',
      { limit: 8, semantic: true },
    );
    expect(draftRow().sourceChunkIds).toEqual([TREATMENT_CHUNK_ID, DIAGNOSIS_CHUNK_ID]);
  });

  it('sem trecho nenhum para o tema, responde 422 sem chamar o modelo', async () => {
    await expect(service.draft(request({ chunkIds: undefined }))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('a falha da trilha não desfaz o rascunho, mas vai para o Sentry', async () => {
    audit.log.mockRejectedValue(new Error('db down'));

    const result = await service.draft(request());

    expect(result.cardIds).toHaveLength(1);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('lista os rascunhos mais recentes primeiro', async () => {
    prisma.knowledgeCardDraft.findMany.mockResolvedValue([
      {
        id: 'd1',
        topic: 't',
        syndrome: 'nao-e-sindrome',
        institutionId: null,
        requestedBy: null,
        status: 'completed',
        requestedModel: 'm',
        servedModel: null,
        promptSha256: 'p',
        sourceContentSha256: 's',
        sourceChunkIds: [],
        cardsAccepted: 0,
        cardsRejected: 0,
        rejections: 'lixo',
        failureReason: null,
        costUsd: 0,
        latencyMs: 1,
        requestId: null,
        createdAt: new Date('2026-10-14T12:00:00Z'),
      },
    ]);
    prisma.knowledgeCardDraft.count.mockResolvedValue(1);

    const page = await service.listDrafts({ limit: 20, offset: 0 });

    expect(prisma.knowledgeCardDraft.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 20,
      skip: 0,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: 'd1', syndrome: null, rejections: [] });
  });
});
