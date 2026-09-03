/**
 * Testes de integração — PROT-004: isolamento de conteúdo institucional.
 *
 * Cobre dois cenários com banco real:
 * 1. Protocolos divergentes: duas instituições podem ter protocolos com o
 *    mesmo nome/especialidade e conteúdos diferentes; cada instituição só
 *    enxerga seu próprio protocolo + os globais — nunca o de outra
 *    instituição (findAll e findById).
 * 2. Retrieval de diretrizes: chunks institucionais nunca vazam para
 *    encounters de outras instituições; chunks globais aparecem para todos.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations
 * aplicadas (incluindo institution_id em protocols/guideline_chunks).
 */
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { ProtocolsService } from '../../src/modules/protocols/protocols.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { RedisService } from '../../src/modules/redis/redis.service';

const PROTOCOL_NAME = 'PROT-004 teste de isolamento';
const GUIDELINE_SOURCE = 'PROT-004 teste de isolamento';

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

describe('PROT-004 — isolamento institucional (integration)', () => {
  let prisma: PrismaClient;
  let institutionA: string;
  let institutionB: string;
  const physicianId = randomUUID();

  beforeAll(async () => {
    prisma = await connectTestDb();

    const [a, b] = await Promise.all([
      prisma.institution.create({ data: { name: 'PROT-004 Hospital A' } }),
      prisma.institution.create({ data: { name: 'PROT-004 Hospital B' } }),
    ]);
    institutionA = a.id;
    institutionB = b.id;
  });

  afterAll(async () => {
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA, institutionB] } } });
    await disconnectTestDb();
  });

  describe('Protocolos divergentes', () => {
    afterEach(async () => {
      await prisma.protocol.deleteMany({ where: { name: PROTOCOL_NAME } });
    });

    it('cada instituição enxerga seu próprio protocolo + globais, nunca o de outra instituição', async () => {
      const auditService = new AuditService(prisma as unknown as PrismaService);
      const service = new ProtocolsService(prisma as unknown as PrismaService, auditService);

      const protocolA = await prisma.protocol.create({
        data: {
          name: PROTOCOL_NAME,
          specialty: 'emergencia',
          institutionId: institutionA,
          createdBy: physicianId,
          status: 'published',
        },
      });
      const protocolB = await prisma.protocol.create({
        data: {
          name: PROTOCOL_NAME,
          specialty: 'emergencia',
          institutionId: institutionB,
          createdBy: physicianId,
          status: 'published',
        },
      });
      const protocolGlobal = await prisma.protocol.create({
        data: {
          name: PROTOCOL_NAME,
          specialty: 'cardiologia',
          institutionId: null,
          createdBy: physicianId,
          status: 'published',
        },
      });

      // findAll: instituição A vê seu protocolo + o global, mas não o de B
      const listA = await service.findAll({ institutionId: institutionA });
      const idsA = listA.map((p) => p.id);
      expect(idsA).toContain(protocolA.id);
      expect(idsA).toContain(protocolGlobal.id);
      expect(idsA).not.toContain(protocolB.id);

      // findAll: instituição B vê seu protocolo + o global, mas não o de A
      const listB = await service.findAll({ institutionId: institutionB });
      const idsB = listB.map((p) => p.id);
      expect(idsB).toContain(protocolB.id);
      expect(idsB).toContain(protocolGlobal.id);
      expect(idsB).not.toContain(protocolA.id);

      // findAll sem institutionId: apenas o global
      const listNone = await service.findAll({});
      const idsNone = listNone.map((p) => p.id);
      expect(idsNone).toContain(protocolGlobal.id);
      expect(idsNone).not.toContain(protocolA.id);
      expect(idsNone).not.toContain(protocolB.id);

      // findById: protocolo de outra instituição é tratado como inexistente
      await expect(service.findById(protocolB.id, institutionA)).rejects.toThrow(NotFoundException);
      await expect(service.findById(protocolA.id, institutionB)).rejects.toThrow(NotFoundException);

      // findById: protocolo próprio e global são acessíveis
      await expect(service.findById(protocolA.id, institutionA)).resolves.toMatchObject({
        id: protocolA.id,
      });
      await expect(service.findById(protocolGlobal.id, institutionA)).resolves.toMatchObject({
        id: protocolGlobal.id,
      });
    });
  });

  describe('Retrieval de diretrizes', () => {
    afterEach(async () => {
      await prisma.guidelineChunk.deleteMany({ where: { source: GUIDELINE_SOURCE } });
    });

    it('chunks institucionais nunca vazam entre instituições; globais aparecem para todos', async () => {
      const embedding = buildEmbedding(42);
      const embeddingStr = `[${embedding.join(',')}]`;

      const [globalChunk, chunkA, chunkB] = await Promise.all([
        prisma.guidelineChunk.create({
          data: {
            source: GUIDELINE_SOURCE,
            sourceVersion: '1.0',
            specialty: 'clinica',
            evidenceLevel: 'A',
            institutionId: null,
            text: 'Diretriz pública sobre sepse.',
            status: 'approved',
            metadata: {},
          },
        }),
        prisma.guidelineChunk.create({
          data: {
            source: GUIDELINE_SOURCE,
            sourceVersion: '1.0',
            specialty: 'clinica',
            evidenceLevel: 'A',
            institutionId: institutionA,
            text: 'Protocolo institucional A sobre sepse.',
            status: 'approved',
            metadata: {},
          },
        }),
        prisma.guidelineChunk.create({
          data: {
            source: GUIDELINE_SOURCE,
            sourceVersion: '1.0',
            specialty: 'clinica',
            evidenceLevel: 'A',
            institutionId: institutionB,
            text: 'Protocolo institucional B sobre sepse.',
            status: 'approved',
            metadata: {},
          },
        }),
      ]);

      await Promise.all(
        [globalChunk.id, chunkA.id, chunkB.id].map(
          (id) =>
            prisma.$executeRaw`UPDATE "guideline_chunks" SET embedding = ${embeddingStr}::vector WHERE id = ${id}::uuid`,
        ),
      );

      const retrievalService = buildRetrievalService(embedding, prisma);

      const resultA = await retrievalService.search('sepse', 10, institutionA);
      const idsA = resultA.chunks.map((c) => c.id);
      expect(idsA).toContain(globalChunk.id);
      expect(idsA).toContain(chunkA.id);
      expect(idsA).not.toContain(chunkB.id);

      const resultB = await retrievalService.search('sepse', 10, institutionB);
      const idsB = resultB.chunks.map((c) => c.id);
      expect(idsB).toContain(globalChunk.id);
      expect(idsB).toContain(chunkB.id);
      expect(idsB).not.toContain(chunkA.id);

      const resultNone = await retrievalService.search('sepse', 10);
      const idsNone = resultNone.chunks.map((c) => c.id);
      expect(idsNone).toContain(globalChunk.id);
      expect(idsNone).not.toContain(chunkA.id);
      expect(idsNone).not.toContain(chunkB.id);
    });
  });
});
