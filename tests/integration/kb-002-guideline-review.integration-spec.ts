/**
 * Testes de integração — KB-002: Pipeline de ingestão em lote com aprovação de curador.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas
 * (incluindo a coluna `status` em guideline_chunks).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { RedisService } from '../../src/modules/redis/redis.service';

const SOURCE = 'KB-002 teste de integração';
const SOURCE_VERSION = '1.0';

function buildEmbedding(seed: number): number[] {
  return Array.from({ length: 1536 }, (_, i) => Math.sin(seed + i) * 0.01);
}

function buildRetrievalService(queryEmbedding: number[], prisma: PrismaClient): RetrievalService {
  const aiGateway = {
    embed: async () => ({ embeddings: [queryEmbedding] }),
  } as unknown as AiGatewayService;

  const redis = {
    get: async () => null,
    set: async () => undefined,
  } as unknown as RedisService;

  return new RetrievalService(prisma as unknown as PrismaService, aiGateway, redis, {
    get: () => undefined,
  } as unknown as ConfigService);
}

describe('KB-002 — pending_review chunks never appear in retrieval (integration)', () => {
  let prisma: PrismaClient;
  let approvedId: string;
  let pendingId: string;

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  afterEach(async () => {
    await prisma.guidelineChunk.deleteMany({ where: { source: SOURCE } });
  });

  it('exclui chunks pending_review da busca semântica e mantém apenas approved', async () => {
    const embedding = buildEmbedding(1);
    const embeddingStr = `[${embedding.join(',')}]`;

    const approved = await prisma.guidelineChunk.create({
      data: {
        source: SOURCE,
        sourceVersion: SOURCE_VERSION,
        specialty: 'clinica',
        evidenceLevel: 'A',
        text: 'Conduta aprovada para dor torácica aguda.',
        status: 'approved',
        metadata: {},
      },
    });
    approvedId = approved.id;

    const pending = await prisma.guidelineChunk.create({
      data: {
        source: SOURCE,
        sourceVersion: SOURCE_VERSION,
        specialty: 'clinica',
        evidenceLevel: 'A',
        text: 'Conduta pendente de revisão para dor torácica aguda.',
        status: 'pending_review',
        metadata: {},
      },
    });
    pendingId = pending.id;

    await prisma.$executeRaw`UPDATE "guideline_chunks" SET embedding = ${embeddingStr}::vector WHERE id = ${approvedId}::uuid`;
    await prisma.$executeRaw`UPDATE "guideline_chunks" SET embedding = ${embeddingStr}::vector WHERE id = ${pendingId}::uuid`;

    const retrievalService = buildRetrievalService(embedding, prisma);

    const result = await retrievalService.search('dor torácica aguda', 5);

    const ids = result.chunks.map((c) => c.id);
    expect(ids).toContain(approvedId);
    expect(ids).not.toContain(pendingId);
  });
});
