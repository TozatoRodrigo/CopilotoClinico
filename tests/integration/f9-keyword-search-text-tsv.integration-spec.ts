/**
 * Testes de integração — F9: `text_tsv` é coluna gerada e a busca lexical
 * passa a funcionar.
 *
 * Antes da migration 20260924180000_f9_guideline_chunks_text_tsv_generated a
 * coluna ficava NULL em todas as linhas: `keywordSearch()` nunca retornava
 * nada e a busca textual da biblioteca nunca achava nada.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import { GuidelinesService } from '../../src/modules/guidelines/guidelines.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { RedisService } from '../../src/modules/redis/redis.service';

const SOURCE = 'F9 teste de integração';
const SOURCE_VERSION = '1.0';

/** Termo raro o bastante para não casar com nenhum outro chunk do banco de teste. */
const EXACT_TERM = 'bromoprida';

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

describe('F9 — busca lexical sobre text_tsv (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  afterEach(async () => {
    await prisma.guidelineChunk.deleteMany({ where: { source: SOURCE } });
  });

  async function createChunk(text: string, status: 'approved' | 'pending_review') {
    return prisma.guidelineChunk.create({
      data: {
        source: SOURCE,
        sourceVersion: SOURCE_VERSION,
        specialty: 'clinica',
        text,
        status,
        metadata: {},
      },
    });
  }

  it('preenche text_tsv na inserção e o recalcula quando o texto muda', async () => {
    const chunk = await createChunk('Náuseas refratárias: considerar ondansetrona.', 'approved');

    const readTsv = async () => {
      const [row] = await prisma.$queryRaw<Array<{ matches: boolean }>>`
        SELECT text_tsv @@ plainto_tsquery('portuguese', ${EXACT_TERM}) AS matches
        FROM guideline_chunks WHERE id = ${chunk.id}::uuid
      `;
      return row!.matches;
    };

    expect(await readTsv()).toBe(false);

    await prisma.guidelineChunk.update({
      where: { id: chunk.id },
      data: { text: `Náuseas refratárias: considerar ${EXACT_TERM} 10 mg IV.` },
    });

    expect(await readTsv()).toBe(true);
  });

  it('keywordSearch acha o chunk approved com o termo exato — mesmo sem embedding', async () => {
    // Sem embedding, a busca semântica não enxerga o chunk: se ele aparece no
    // resultado, veio da busca lexical.
    const approved = await createChunk(
      `Náuseas refratárias no pronto-socorro: considerar ${EXACT_TERM} 10 mg IV.`,
      'approved',
    );
    const pending = await createChunk(
      `Rascunho: ${EXACT_TERM} como alternativa em gestantes.`,
      'pending_review',
    );

    const retrieval = buildRetrievalService(buildEmbedding(7), prisma);
    const result = await retrieval.search(EXACT_TERM, 5);

    const ids = result.chunks.map((c) => c.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(pending.id);
  });

  it('não deixa hit só lexical com embedding distante passar do piso semântico', async () => {
    const chunk = await createChunk(`Uso de ${EXACT_TERM} em gastroparesia diabética.`, 'approved');
    const chunkEmbedding = buildEmbedding(1);
    await prisma.$executeRaw`UPDATE "guideline_chunks" SET embedding = ${`[${chunkEmbedding.join(',')}]`}::vector WHERE id = ${chunk.id}::uuid`;

    // Embedding da query ortogonal ao do chunk: similaridade ~0, abaixo do piso.
    const queryEmbedding = chunkEmbedding.map((_, i) => (i % 2 === 0 ? 0.01 : -0.01));
    const [row] = await prisma.$queryRaw<Array<{ similarity: number }>>`
      SELECT 1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) AS similarity
      FROM guideline_chunks WHERE id = ${chunk.id}::uuid
    `;
    expect(Number(row!.similarity)).toBeLessThan(0.3);

    const retrieval = buildRetrievalService(queryEmbedding, prisma);
    const result = await retrieval.search(EXACT_TERM, 5);

    expect(result.chunks.map((c) => c.id)).not.toContain(chunk.id);
  });

  it('a busca textual da biblioteca acha o chunk approved pelo termo exato', async () => {
    const approved = await createChunk(`Antiemético de escolha: ${EXACT_TERM}.`, 'approved');

    const guidelines = new GuidelinesService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
    );
    const rows = await guidelines.searchChunks(EXACT_TERM);

    expect(rows.map((r) => r.id)).toContain(approved.id);
  });
});
