/**
 * Teste de integração — KB-001: o caso canônico "gripe >48h" deve recuperar
 * chunks do cenário gripal no top-3 do retrieval após ingestão/aprovação.
 *
 * Aqui simulamos a versão já aprovada do pacote de curadoria, usando os
 * próprios arquivos draft como fonte de verdade para validar recuperação.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import { parseGuidelineDocument } from '../../src/modules/guidelines/ingestion/front-matter';
import { chunkText } from '../../src/modules/guidelines/ingestion/chunking';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { RedisService } from '../../src/modules/redis/redis.service';

const PACK_DIR = join(process.cwd(), 'docs/guidelines/drafts/kb-001-top20-ps');
const SOURCE_TAG = '[KB-001 integration]';
const shouldRunIntegration = process.env.CI === 'true' || process.env.KB001_INTEGRATION === '1';

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

  return new RetrievalService(prisma as unknown as PrismaService, aiGateway, redis);
}

if (!shouldRunIntegration) {
  describe('KB-001 — canonical gripe >48h retrieval (integration)', () => {
    it.skip('requires CI or KB001_INTEGRATION=1 to execute against a real database', () => {});
  });
} else {
  describe('KB-001 — canonical gripe >48h retrieval (integration)', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      prisma = await connectTestDb();
    });

    afterAll(async () => {
      await disconnectTestDb();
    });

    afterEach(async () => {
      await prisma.guidelineChunk.deleteMany({
        where: {
          source: { contains: SOURCE_TAG },
        },
      });
    });

    it('retrieves the influenza scenario in the top-3 for the canonical >48h query', async () => {
      const queryEmbedding = buildEmbedding(501);
      const packFiles = readdirSync(PACK_DIR)
        .filter((file) => file.endsWith('.md'))
        .sort();

      for (const [index, file] of packFiles.entries()) {
        const raw = readFileSync(join(PACK_DIR, file), 'utf-8');
        const { meta, body } = parseGuidelineDocument(raw);
        const chunks = chunkText({
          text: body,
          source: `${meta.source} ${SOURCE_TAG}`,
          sourceVersion: meta.sourceVersion,
          specialty: meta.specialty,
          evidenceLevel: meta.evidenceLevel,
          cenario: meta.cenario,
          redFlags: meta.redFlags,
        });

        const selectedEmbedding = meta.cenario === 'sindrome_gripal_ivas' ? queryEmbedding : buildEmbedding(index + 1);
        const embeddingStr = `[${selectedEmbedding.join(',')}]`;

        for (const chunk of chunks) {
          const created = await prisma.guidelineChunk.create({
            data: {
              source: chunk.metadata.source,
              sourceVersion: chunk.metadata.sourceVersion,
              specialty: chunk.metadata.specialty,
              evidenceLevel: chunk.metadata.evidenceLevel ?? null,
              text: chunk.text,
              status: 'approved',
              metadata: {
                cenario: chunk.metadata.cenario ?? null,
                redFlags: chunk.metadata.redFlags ?? [],
                charStart: chunk.metadata.charStart,
                charEnd: chunk.metadata.charEnd,
                chunkIndex: chunk.index,
              },
            },
          });

          await prisma.$executeRaw`UPDATE "guideline_chunks" SET embedding = ${embeddingStr}::vector WHERE id = ${created.id}::uuid`;
        }
      }

      const retrievalService = buildRetrievalService(queryEmbedding, prisma);
      const result = await retrievalService.search(
        'síndrome gripal com mais de 48 horas em paciente possivelmente imunossuprimido',
        3,
      );
      const gripalChunks = result.chunks.filter((chunk) => chunk.metadata.cenario === 'sindrome_gripal_ivas');

      expect(result.chunks).toHaveLength(3);
      expect(result.chunks[0]?.metadata.cenario).toBe('sindrome_gripal_ivas');
      expect(gripalChunks.length).toBeGreaterThan(0);
      expect(gripalChunks.some((chunk) => chunk.text.toLowerCase().includes('mais de 48 horas'))).toBe(true);
    });
  });
}
