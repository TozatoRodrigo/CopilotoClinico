import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../config/prisma.service';
import { storedCardContent } from '../../../../tests/fixtures/knowledge-cards';
import type { CardEmbedder } from './card-embedder';
import { cardEmbeddingText, embeddingTextSha256 } from './card-embedding-text';
import type { IndexCardRow } from './card-index-eligibility';
import { CardIndexService } from './card-index.service';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const CARD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CARD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VERSION_A = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const VERSION_B = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const INSTITUTION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MODEL = 'text-embedding-3-small';
const { content, contentSha256 } = storedCardContent();

function cardRow(id: string, versionId: string, overrides: Partial<IndexCardRow> = {}) {
  return {
    id,
    topic: 'Meningite bacteriana',
    syndrome: 'febre',
    institutionId: null,
    status: 'published',
    publishedVersion: {
      id: versionId,
      content: content as unknown as Prisma.JsonValue,
      contentSha256,
      reviewDecision: 'approved',
      validUntil: new Date('2027-10-15T12:00:00.000Z'),
      reviewer: { crmVerified: true },
    },
    ...overrides,
  } as IndexCardRow;
}

const TEXT_SHA = embeddingTextSha256(cardEmbeddingText('Meningite bacteriana', content));

/** Fake de embedding: um vetor de 3 dimensões por texto, nenhuma chamada de rede. */
function fakeEmbedder(): CardEmbedder & {
  embed: ReturnType<typeof vi.fn>;
  enabled: ReturnType<typeof vi.fn>;
} {
  return {
    enabled: vi.fn().mockReturnValue(true),
    identity: () => ({ provider: 'openai', model: MODEL }),
    embed: vi.fn(async (texts: readonly string[]) => texts.map((_, i) => [i + 1, 0, 0])),
  };
}

function createPrisma() {
  return {
    knowledgeCard: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeCardIndexEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

/** Os valores de um `Prisma.sql` gravado (`$executeRaw(sql)`), na ordem. */
function sqlOf(call: unknown[] | undefined): { text: string; values: unknown[] } {
  const sql = call?.[0] as Prisma.Sql;
  return { text: sql.sql, values: sql.values };
}

describe('CardIndexService (CC-406)', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let embedder: ReturnType<typeof fakeEmbedder>;
  let service: CardIndexService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = createPrisma();
    embedder = fakeEmbedder();
    service = new CardIndexService(prisma as unknown as PrismaService, embedder);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('syncCard', () => {
    it('indexa o cartão recém-publicado com o vetor do texto do cartão', async () => {
      prisma.knowledgeCard.findMany.mockResolvedValue([cardRow(CARD_A, VERSION_A)]);

      const report = await service.syncCard(CARD_A);

      expect(embedder.embed).toHaveBeenCalledWith(
        [cardEmbeddingText('Meningite bacteriana', content)],
        'document',
      );
      const { text, values } = sqlOf(prisma.$executeRaw.mock.calls[0]);
      expect(text).toContain('INSERT INTO knowledge_card_index');
      expect(text).toContain('ON CONFLICT (card_id) DO UPDATE');
      expect(values).toEqual([
        CARD_A,
        VERSION_A,
        null,
        'febre',
        new Date('2027-10-15T12:00:00.000Z'),
        contentSha256,
        TEXT_SHA,
        '[1,0,0]',
        'openai',
        MODEL,
      ]);
      expect(report).toEqual({
        embedded: 1,
        withoutEmbedding: 0,
        unchanged: 0,
        ineligible: {},
        removed: 0,
      });
    });

    it('reindexa quando outra versão é publicada', async () => {
      prisma.knowledgeCard.findMany.mockResolvedValue([cardRow(CARD_A, VERSION_B)]);
      prisma.knowledgeCardIndexEntry.findMany.mockResolvedValue([
        { cardId: CARD_A, versionId: VERSION_A, textSha256: TEXT_SHA, embeddingModel: MODEL },
      ]);

      await service.syncCard(CARD_A);

      expect(embedder.embed).toHaveBeenCalledTimes(1);
      expect(sqlOf(prisma.$executeRaw.mock.calls[0]).values[1]).toBe(VERSION_B);
    });

    it('não reembute o que não mudou', async () => {
      prisma.knowledgeCard.findMany.mockResolvedValue([cardRow(CARD_A, VERSION_A)]);
      prisma.knowledgeCardIndexEntry.findMany.mockResolvedValue([
        { cardId: CARD_A, versionId: VERSION_A, textSha256: TEXT_SHA, embeddingModel: MODEL },
      ]);

      const report = await service.syncCard(CARD_A);

      expect(embedder.embed).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(report).toMatchObject({ unchanged: 1, embedded: 0 });
    });

    it('tira do índice o cartão arquivado', async () => {
      prisma.knowledgeCard.findMany.mockResolvedValue([
        cardRow(CARD_A, VERSION_A, { status: 'archived' }),
      ]);
      prisma.knowledgeCardIndexEntry.deleteMany.mockResolvedValue({ count: 1 });

      const report = await service.syncCard(CARD_A);

      expect(prisma.knowledgeCardIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { cardId: { in: [CARD_A] } },
      });
      expect(embedder.embed).not.toHaveBeenCalled();
      expect(report).toMatchObject({ ineligible: { archived: 1 }, removed: 1 });
    });

    it('grava a linha sem vetor quando o embedding está desligado — e não chama o provedor', async () => {
      embedder.enabled.mockReturnValue(false);
      prisma.knowledgeCard.findMany.mockResolvedValue([cardRow(CARD_A, VERSION_A)]);

      const report = await service.syncCard(CARD_A);

      expect(embedder.embed).not.toHaveBeenCalled();
      expect(sqlOf(prisma.$executeRaw.mock.calls[0]).values.slice(7)).toEqual([null, null, null]);
      expect(report).toMatchObject({ withoutEmbedding: 1, embedded: 0 });
    });

    it('grava sem vetor quando o provedor falha, sem deixar o vetor da versão anterior', async () => {
      embedder.embed.mockRejectedValue(new Error('429'));
      prisma.knowledgeCard.findMany.mockResolvedValue([cardRow(CARD_A, VERSION_B)]);
      prisma.knowledgeCardIndexEntry.findMany.mockResolvedValue([
        { cardId: CARD_A, versionId: VERSION_A, textSha256: TEXT_SHA, embeddingModel: MODEL },
      ]);

      const report = await service.syncCard(CARD_A);

      const { values } = sqlOf(prisma.$executeRaw.mock.calls[0]);
      expect(values[1]).toBe(VERSION_B);
      expect(values.slice(7)).toEqual([null, null, null]);
      expect(report).toMatchObject({ withoutEmbedding: 1 });
    });

    it('nunca lança: falha de banco vira log e o cartão fica fora até o reindex', async () => {
      prisma.knowledgeCard.findMany.mockRejectedValue(new Error('db down'));

      await expect(service.syncCard(CARD_A)).resolves.toBeNull();
    });
  });

  describe('syncAll', () => {
    it('indexa o que falta, mantém o que vale e apaga o resto — inclusive vencido', async () => {
      prisma.knowledgeCard.findMany.mockResolvedValue([
        cardRow(CARD_A, VERSION_A),
        cardRow(CARD_B, VERSION_B, {
          publishedVersion: {
            ...cardRow(CARD_B, VERSION_B).publishedVersion!,
            validUntil: new Date('2026-10-01T00:00:00.000Z'),
          },
        }),
      ]);
      prisma.knowledgeCardIndexEntry.deleteMany.mockResolvedValue({ count: 2 });

      const report = await service.syncAll();

      expect(prisma.knowledgeCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { publishedVersionId: { not: null } } }),
      );
      expect(prisma.knowledgeCardIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { cardId: { notIn: [CARD_A] } },
      });
      expect(report).toEqual({
        embedded: 1,
        withoutEmbedding: 0,
        unchanged: 0,
        ineligible: { expired: 1 },
        removed: 2,
      });
    });

    it('reembute tudo quando o modelo de embedding muda', async () => {
      prisma.knowledgeCard.findMany.mockResolvedValue([
        cardRow(CARD_A, VERSION_A),
        cardRow(CARD_B, VERSION_B),
      ]);
      prisma.knowledgeCardIndexEntry.findMany.mockResolvedValue([
        { cardId: CARD_A, versionId: VERSION_A, textSha256: TEXT_SHA, embeddingModel: 'velho' },
        { cardId: CARD_B, versionId: VERSION_B, textSha256: TEXT_SHA, embeddingModel: 'velho' },
      ]);

      const report = await service.syncAll();

      expect(embedder.embed).toHaveBeenCalledTimes(1);
      expect(embedder.embed.mock.calls[0]?.[0]).toHaveLength(2);
      expect(report.embedded).toBe(2);
    });

    it('deixa o erro de banco subir para o script', async () => {
      prisma.knowledgeCard.findMany.mockRejectedValue(new Error('db down'));

      await expect(service.syncAll()).rejects.toThrow('db down');
    });
  });

  describe('search', () => {
    it('embute as consultas como consulta e lê os vizinhos de cada uma, já filtrados', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ card_id: CARD_A, version_id: VERSION_A, similarity: '0.71' }])
        .mockResolvedValueOnce([
          { card_id: CARD_B, version_id: VERSION_B, similarity: 0.66 },
          { card_id: CARD_A, version_id: VERSION_A, similarity: 0.52 },
        ]);

      const outcome = await service.search({
        queries: ['meningite bacteriana antibiótico', 'Meningite bacteriana antibiótico', 'sepse'],
        institutionId: INSTITUTION,
        limitPerQuery: 8,
      });

      expect(embedder.embed).toHaveBeenCalledWith(
        ['meningite bacteriana antibiótico', 'sepse'],
        'query',
      );
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      const { text, values } = sqlOf(prisma.$queryRaw.mock.calls[0]);
      for (const filter of [
        'i.embedding_model =',
        'vector_dims(i.embedding) =',
        'i.valid_until > NOW()',
        "c.status <> 'archived'",
        'c.published_version_id = i.version_id',
        "v.review_decision = 'approved'",
        'p.crm_verified = true',
        'i.institution_id IS NULL OR i.institution_id =',
      ]) {
        expect(text).toContain(filter);
      }
      expect(values).toEqual(expect.arrayContaining([MODEL, 3, INSTITUTION, 8]));
      expect(outcome).toEqual({
        status: 'ok',
        hits: [
          { cardId: CARD_A, versionId: VERSION_A, similarity: 0.71, queryIndexes: [0, 1] },
          { cardId: CARD_B, versionId: VERSION_B, similarity: 0.66, queryIndexes: [1] },
        ],
      });
    });

    it('sem instituição, só cartões globais', async () => {
      await service.search({ queries: ['dor torácica'], institutionId: null, limitPerQuery: 5 });

      const { text } = sqlOf(prisma.$queryRaw.mock.calls[0]);
      expect(text).toContain('AND i.institution_id IS NULL');
      expect(text).not.toContain('i.institution_id =');
    });

    it('não busca sem consulta, com embedding desligado ou quando o provedor falha', async () => {
      await expect(
        service.search({ queries: ['  '], institutionId: null, limitPerQuery: 5 }),
      ).resolves.toEqual({ status: 'unavailable', reason: 'no_queries' });

      embedder.enabled.mockReturnValue(false);
      await expect(
        service.search({ queries: ['dor'], institutionId: null, limitPerQuery: 5 }),
      ).resolves.toEqual({ status: 'unavailable', reason: 'embeddings_disabled' });

      embedder.enabled.mockReturnValue(true);
      embedder.embed.mockRejectedValue(new Error('sem crédito'));
      await expect(
        service.search({ queries: ['dor'], institutionId: null, limitPerQuery: 5 }),
      ).resolves.toEqual({ status: 'unavailable', reason: 'embedding_failed' });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
