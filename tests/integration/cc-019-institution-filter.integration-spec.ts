/**
 * Testes de integração — CC-019: filtro de instituição (ADR-009) em todo
 * caminho que devolve diretriz ou protocolo ao médico.
 *
 * Duas instituições ativas (A e B) e uma desativada (C). O médico A tem
 * vínculo com A e com C; o médico B, só com B. Cada caminho é chamado como o
 * médico, pelo controller com os serviços reais e o banco real. A regra:
 * conteúdo global para todos; institucional só para quem tem vínculo ativo
 * (vínculo existe e a instituição está ativa).
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations
 * aplicadas.
 */
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { GuidelinesController } from '../../src/modules/guidelines/guidelines.controller';
import { GuidelinesService } from '../../src/modules/guidelines/guidelines.service';
import { suggestGuidelineSchema } from '../../src/modules/guidelines/schemas/guidelines.schemas';
import { InstitutionsService } from '../../src/modules/institutions/institutions.service';
import { activeInstitutionIds } from '../../src/modules/institutions/institution-visibility';
import { ProtocolsController } from '../../src/modules/protocols/protocols.controller';
import { ProtocolsService } from '../../src/modules/protocols/protocols.service';
import type { CreateProtocolInput } from '../../src/modules/protocols/schemas/protocol.schemas';
import { ProtocolEngineController } from '../../src/modules/copilot/protocol-engine/protocol-engine.controller';
import { ProtocolEngineService } from '../../src/modules/copilot/protocol-engine/protocol-engine.service';
import { EncountersService } from '../../src/modules/encounters/encounters.service';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { LgpdService } from '../../src/modules/lgpd/lgpd.service';
import type { RedisService } from '../../src/modules/redis/redis.service';

/** Especialidade só deste teste: a biblioteca não enxerga dado de outro teste. */
const SPECIALTY = 'cc019_isolamento';
const SUGGESTION_SOURCE = 'CC-019 sugestão com instituição';
const PROTOCOL_PREFIX = 'CC-019 protocolo';

const embedding = Array.from({ length: 1536 }, (_, i) => Math.sin(42 + i) * 0.01);
const embeddingStr = `[${embedding.join(',')}]`;

/** A auditoria não é o assunto aqui; a real escreveria na trilha encadeada. */
const audit = { log: async () => undefined } as unknown as AuditService;

function graph(name: string, institutionId?: string): CreateProtocolInput {
  return {
    name,
    specialty: SPECIALTY,
    institutionId,
    nodes: [
      {
        id: 'q1',
        nodeType: 'question',
        order: 0,
        content: { question: 'Lactato acima de 4?', answerType: 'boolean' },
      },
      { id: 'a1', nodeType: 'action', order: 1, content: { action: 'Expandir volume' } },
      { id: 'o1', nodeType: 'outcome', order: 2, content: { outcome: 'Reavaliar' } },
    ],
    edges: [
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false } },
      { fromNodeId: 'a1', toNodeId: 'o1', condition: null },
    ],
  };
}

function asPhysician(physicianId: string) {
  return { user: { physicianId } };
}

describe('CC-019 — filtro de instituição em diretrizes e protocolos (integration)', () => {
  let prisma: PrismaClient;
  let db: PrismaService;
  let institutionA: string;
  let institutionB: string;
  let institutionC: string;
  let physicianA: string;
  let physicianB: string;
  const chunk = { global: '', a: '', b: '', c: '' };
  let guidelines: GuidelinesController;
  let institutions: InstitutionsService;

  async function createChunk(
    source: string,
    institutionId: string | null,
    text: string,
  ): Promise<string> {
    const created = await prisma.guidelineChunk.create({
      data: {
        source,
        sourceVersion: '1',
        specialty: SPECIALTY,
        institutionId,
        text,
        status: 'approved',
      },
    });
    await prisma.$executeRaw`UPDATE "guideline_chunks" SET embedding = ${embeddingStr}::vector WHERE id = ${created.id}::uuid`;
    return created.id;
  }

  async function createPhysician(label: string): Promise<string> {
    const suffix = randomUUID();
    const physician = await prisma.physician.create({
      data: {
        crmUf: 'SP',
        crmNumber: suffix.slice(0, 8),
        email: `cc019-${label}-${suffix}@teste.invalid`,
        passwordHash: 'nao-usado',
      },
    });
    return physician.id;
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    db = prisma as unknown as PrismaService;

    const [a, b, c] = await Promise.all([
      prisma.institution.create({ data: { name: 'CC-019 Hospital A' } }),
      prisma.institution.create({ data: { name: 'CC-019 Hospital B' } }),
      prisma.institution.create({ data: { name: 'CC-019 Hospital C', status: 'inactive' } }),
    ]);
    institutionA = a.id;
    institutionB = b.id;
    institutionC = c.id;

    physicianA = await createPhysician('a');
    physicianB = await createPhysician('b');
    await prisma.physicianInstitution.createMany({
      data: [
        { physicianId: physicianA, institutionId: institutionA },
        { physicianId: physicianA, institutionId: institutionC },
        { physicianId: physicianB, institutionId: institutionB },
      ],
    });

    chunk.global = await createChunk(
      'CC-019 Diretriz pública',
      null,
      'Sepse: dosar lactato e iniciar antibiótico na primeira hora.',
    );
    chunk.a = await createChunk(
      'CC-019 Protocolo do hospital A',
      institutionA,
      'Sepse no hospital A: lactato na triagem e kit de antibiótico no box.',
    );
    chunk.b = await createChunk(
      'CC-019 Protocolo do hospital B',
      institutionB,
      'Sepse no hospital B: lactato arterial e antibiótico pelo time de resposta rápida.',
    );
    chunk.c = await createChunk(
      'CC-019 Protocolo do hospital C',
      institutionC,
      'Sepse no hospital C: lactato e antibiótico conforme a farmácia clínica.',
    );
    // Trechos de B que, sem o filtro no banco, ocupariam as primeiras vagas:
    // fonte que vem antes na ordem alfabética (biblioteca) e "lactato"
    // repetido (busca por palavra).
    for (let i = 0; i < 3; i++) {
      await createChunk(
        `CC-019 A0 Protocolo extra do hospital B ${i}`,
        institutionB,
        'Lactato lactato lactato lactato: protocolo de lactato seriado do hospital B.',
      );
    }

    institutions = new InstitutionsService(db, audit);
    const aiGateway = { embeddingsEnabled: () => false } as unknown as AiGatewayService;
    // CC-010 — sem embedding no teste, o consentimento de IA não muda a busca.
    const lgpd = { checkConsent: async () => true } as unknown as LgpdService;
    guidelines = new GuidelinesController(
      new GuidelinesService(db, aiGateway, audit),
      institutions,
      lgpd,
    );
  });

  afterAll(async () => {
    await prisma.protocolRun.deleteMany({ where: { startedBy: { in: [physicianA, physicianB] } } });
    await prisma.physician.deleteMany({ where: { id: { in: [physicianA, physicianB] } } });
    await prisma.protocol.deleteMany({ where: { name: { startsWith: PROTOCOL_PREFIX } } });
    await prisma.guidelineChunk.deleteMany({
      where: { OR: [{ specialty: SPECIALTY }, { source: SUGGESTION_SOURCE }] },
    });
    await prisma.institution.deleteMany({
      where: { id: { in: [institutionA, institutionB, institutionC] } },
    });
    await disconnectTestDb();
  });

  describe('vínculo ativo', () => {
    it('conta o vínculo com instituição ativa; o com instituição desativada, não', async () => {
      expect(await activeInstitutionIds(db, physicianA)).toEqual([institutionA]);
      expect(await activeInstitutionIds(db, physicianB)).toEqual([institutionB]);
    });
  });

  describe('GET /guidelines/search (busca e biblioteca)', () => {
    it.each([
      ['busca', 'lactato'],
      ['biblioteca', ''],
    ])('%s: cada médico vê o global e o da sua instituição, nunca o de outra', async (_m, q) => {
      const ofA = (await guidelines.search(asPhysician(physicianA), q, SPECIALTY, '50')).map(
        (row) => row.id,
      );
      const ofB = (await guidelines.search(asPhysician(physicianB), q, SPECIALTY, '50')).map(
        (row) => row.id,
      );

      expect(ofA).toEqual(expect.arrayContaining([chunk.global, chunk.a]));
      expect(ofA).not.toContain(chunk.b);
      expect(ofA).not.toContain(chunk.c); // instituição desativada
      expect(ofA).toHaveLength(2);

      expect(ofB).toEqual(expect.arrayContaining([chunk.global, chunk.b]));
      expect(ofB).not.toContain(chunk.a);
      expect(ofB).not.toContain(chunk.c);
    });

    it.each([
      ['busca', 'lactato'],
      ['biblioteca', ''],
    ])('%s: a página não vem curta — o filtro é no banco, antes do LIMIT', async (_m, q) => {
      const rows = await guidelines.search(asPhysician(physicianA), q, SPECIALTY, '2');

      expect(rows.map((row) => row.id).sort()).toEqual([chunk.global, chunk.a].sort());
    });
  });

  describe('GET /guidelines/chunks/:id (link da citação)', () => {
    it('abre o global e o da própria instituição', async () => {
      await expect(
        guidelines.getChunk(asPhysician(physicianA), chunk.global),
      ).resolves.toMatchObject({ id: chunk.global });
      await expect(guidelines.getChunk(asPhysician(physicianA), chunk.a)).resolves.toMatchObject({
        id: chunk.a,
      });
    });

    it('o de outra instituição, ou de instituição desativada, é 404 como id inexistente', async () => {
      await expect(guidelines.getChunk(asPhysician(physicianA), chunk.b)).rejects.toThrow(
        NotFoundException,
      );
      await expect(guidelines.getChunk(asPhysician(physicianA), chunk.c)).rejects.toThrow(
        NotFoundException,
      );
      await expect(guidelines.getChunk(asPhysician(physicianB), chunk.a)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /guidelines/consult', () => {
    it('só conteúdo global, para qualquer médico', async () => {
      const { results } = await guidelines.consult(asPhysician(physicianB), {
        query: 'lactato antibiótico',
      });
      const ids = results.map((result) => result.chunkId);

      expect(ids).toContain(chunk.global);
      for (const institutional of [chunk.a, chunk.b, chunk.c]) {
        expect(ids).not.toContain(institutional);
      }
    });
  });

  describe('POST /guidelines/suggest', () => {
    it('a sugestão não aceita instituição: entra global e pendente, fora da busca', async () => {
      const body = suggestGuidelineSchema.parse({
        text: 'Protocolo de sepse que o médico quer ver na base, com lactato e antibiótico precoce.',
        source: SUGGESTION_SOURCE,
        institutionId: institutionA,
      });

      await guidelines.suggest(asPhysician(physicianB), body);

      const suggested = await prisma.guidelineChunk.findMany({
        where: { source: SUGGESTION_SOURCE },
        select: { institutionId: true, status: true },
      });
      expect(suggested.length).toBeGreaterThan(0);
      for (const row of suggested) {
        expect(row).toEqual({ institutionId: null, status: 'pending_review' });
      }
    });
  });

  describe('busca da análise (RetrievalService)', () => {
    function retrieval(): RetrievalService {
      const aiGateway = {
        embed: async (texts: string[]) => ({ embeddings: texts.map(() => embedding) }),
        getEmbeddingProviderName: () => 'test',
        embeddingsEnabled: () => true,
        getEmbeddingModel: () => 'test-embedding',
      } as unknown as AiGatewayService;
      const redis = {
        get: async () => null,
        set: async () => undefined,
      } as unknown as RedisService;
      return new RetrievalService(db, aiGateway, redis, {
        get: () => undefined,
      } as unknown as ConfigService);
    }

    it('com a instituição do caso: global e a dela, nunca a de outra (busca e busca dirigida)', async () => {
      const service = retrieval();
      const single = (await service.search('lactato', 10, institutionA)).chunks.map((c) => c.id);
      const directed = (
        await service.searchMany(['lactato', 'sepse'], 10, institutionB)
      ).chunks.map((c) => c.id);

      expect(single).toEqual(expect.arrayContaining([chunk.global, chunk.a]));
      expect(single).not.toContain(chunk.b);
      expect(single).not.toContain(chunk.c);
      expect(directed).toContain(chunk.global);
      expect(directed).toContain(chunk.b);
      expect(directed).not.toContain(chunk.a);
    });

    it('sem instituição (o caso perdeu o vínculo ativo): só o global', async () => {
      const ids = (await retrieval().search('lactato', 10, null)).chunks.map((c) => c.id);

      expect(ids).toContain(chunk.global);
      for (const institutional of [chunk.a, chunk.b, chunk.c]) {
        expect(ids).not.toContain(institutional);
      }
    });
  });

  describe('protocolos', () => {
    let protocols: ProtocolsController;
    let engine: ProtocolEngineController;
    let draftOfA: string;
    let publishedOfA: string;
    let publishedGlobal: string;

    beforeAll(async () => {
      const service = new ProtocolsService(db, audit);
      protocols = new ProtocolsController(service, institutions);
      engine = new ProtocolEngineController(
        new ProtocolEngineService(
          db,
          new EncountersService(db, audit, institutions),
          service,
          audit,
        ),
      );

      draftOfA = (
        await service.create(physicianA, graph(`${PROTOCOL_PREFIX} rascunho A`, institutionA))
      ).id;
      publishedOfA = (
        await service.create(physicianA, graph(`${PROTOCOL_PREFIX} publicado A`, institutionA))
      ).id;
      publishedGlobal = (await service.create(physicianA, graph(`${PROTOCOL_PREFIX} global`))).id;
      await prisma.protocol.updateMany({
        where: { id: { in: [publishedOfA, publishedGlobal] } },
        data: { status: 'published', publishedAt: new Date() },
      });
    });

    it('GET /protocols e GET /protocols/:id: o de A não aparece para o médico B', async () => {
      const ofB = (await protocols.findAll(asPhysician(physicianB), SPECIALTY)).map((p) => p.id);
      // Vínculo com A (ativa) e C (desativada): só A conta, e vira a instituição implícita.
      const ofA = (await protocols.findAll(asPhysician(physicianA), SPECIALTY)).map((p) => p.id);

      expect(ofB).toContain(publishedGlobal);
      expect(ofB).not.toContain(publishedOfA);
      expect(ofA).toEqual(expect.arrayContaining([publishedGlobal, publishedOfA, draftOfA]));
      await expect(protocols.findOne(asPhysician(physicianB), publishedOfA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('POST /protocols/:id/publish: o médico B não publica nem lê o rascunho de A', async () => {
      await expect(protocols.publish(asPhysician(physicianB), draftOfA)).rejects.toThrow(
        NotFoundException,
      );
      const stillDraft = await prisma.protocol.findUnique({ where: { id: draftOfA } });
      expect(stillDraft?.status).toBe('draft');
    });

    it('POST /protocols/:id/revise: o médico B não cria versão do protocolo de A', async () => {
      await expect(
        protocols.revise(asPhysician(physicianB), publishedOfA, graph('ignorado')),
      ).rejects.toThrow(NotFoundException);
      const versions = await prisma.protocol.count({
        where: { name: `${PROTOCOL_PREFIX} publicado A` },
      });
      expect(versions).toBe(1);
    });

    it('POST /protocols: protocolo institucional só de quem tem vínculo ativo', async () => {
      await expect(
        protocols.create(
          asPhysician(physicianB),
          graph(`${PROTOCOL_PREFIX} intruso`, institutionA),
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        protocols.create(asPhysician(physicianA), graph(`${PROTOCOL_PREFIX} em C`, institutionC)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('roteiro de protocolo no caso: o médico B não roda o protocolo de A; o global, sim', async () => {
      const encounters = new EncountersService(db, audit, institutions);
      const encounter = await encounters.create(physicianB, {
        vertical: 'clinica',
        context: { hasCT: false, isSus: false, hasLab: false, hasICU: false },
      });

      await expect(
        engine.start(asPhysician(physicianB), encounter.id, { protocolId: publishedOfA }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        engine.start(asPhysician(physicianB), encounter.id, { protocolId: publishedGlobal }),
      ).resolves.toMatchObject({ protocolId: publishedGlobal });
    });
  });
});
