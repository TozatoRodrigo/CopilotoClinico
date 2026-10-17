/**
 * Testes de integração — CC-406 e CC-408 (ADR-019, emendas de 15/10/2026): índice
 * semântico dos cartões revisados.
 *
 * Requisito: banco PostgreSQL com pgvector acessível via DATABASE_URL, com as
 * migrations aplicadas (20261015120000_cc_406_knowledge_card_index) e a role
 * `copiloto_app` da AUD-002.
 *
 * Cobre o que os testes unitários não alcançam: o upsert com `vector` sem
 * dimensão fixa, a busca por cosseno com os filtros de elegibilidade na
 * consulta, a varredura que tira o vencido e o arquivado, e os GRANTs. O
 * embedding é um fake por palavra-chave: nenhuma chamada de IA sai daqui.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import type { PrismaService } from '../../src/config/prisma.service';
import type { CardEmbedder } from '../../src/modules/knowledge-cards/card-index/card-embedder';
import { CardIndexService } from '../../src/modules/knowledge-cards/card-index/card-index.service';
import { ConfigService } from '@nestjs/config';
import type { AuditService } from '../../src/modules/audit/audit.service';
import { SimilarityThemeGate } from '../../src/modules/knowledge-cards/card-retrieval/card-relevance-gate';
import { ReviewedCardRetrievalService } from '../../src/modules/knowledge-cards/card-retrieval/reviewed-card-retrieval.service';
import { KnowledgeCardsService } from '../../src/modules/knowledge-cards/knowledge-cards.service';
import { storedCardContent } from '../fixtures/knowledge-cards';

const EMAIL_DOMAIN = '@cc406.test';
const TOPIC_PREFIX = 'CC-406 ';
const RUNTIME_ROLE = 'copiloto_app';

/** Uma dimensão por tema: o vetor do cartão vem do tema; o da consulta, das palavras dela. */
const TERMS = ['meningite', 'anafilaxia', 'escorpiao', 'sepse'];
function keywordVector(text: string): number[] {
  const normalized = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const firstLine = normalized.split('\n')[0] ?? normalized;
  // Cartão: só a linha "Tema: …", para os cartões de teste (mesmo conteúdo) se separarem.
  const source = normalized.startsWith('tema:') ? firstLine : normalized;
  const vector = TERMS.map((term) => (source.includes(term) ? 1 : 0));
  return vector.some((value) => value > 0) ? vector : [0, 0, 0, 0.1];
}

function keywordEmbedder(model = 'fake-keyword-v1'): CardEmbedder & { enabledFlag: boolean } {
  const embedder = {
    enabledFlag: true,
    enabled: () => embedder.enabledFlag,
    identity: () => ({ provider: 'test', model }),
    embed: async (texts: readonly string[]) => texts.map(keywordVector),
  };
  return embedder;
}

describe('CC-406 — índice semântico dos cartões (integration)', () => {
  let prisma: PrismaClient;
  let verifiedReviewerId: string;
  let unverifiedReviewerId: string;
  let institutionId: string;
  let embedder: ReturnType<typeof keywordEmbedder>;
  let index: CardIndexService;
  const { content, contentSha256 } = storedCardContent();

  async function cleanUp(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_cards SET status = 'archived', archived_at = now(), published_version_id = NULL
        WHERE topic LIKE '${TOPIC_PREFIX}%'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_card_versions
        WHERE card_id IN (SELECT id FROM knowledge_cards WHERE topic LIKE '${TOPIC_PREFIX}%')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_cards WHERE topic LIKE '${TOPIC_PREFIX}%'`,
    );
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await prisma.institution.deleteMany({ where: { name: { startsWith: TOPIC_PREFIX } } });
  }

  async function publishedCard(
    topic: string,
    options: {
      reviewerId?: string;
      institutionId?: string | null;
      validUntil?: Date;
      archived?: boolean;
      syndrome?: string;
    } = {},
  ): Promise<{ cardId: string; versionId: string }> {
    const reviewerId = options.reviewerId ?? verifiedReviewerId;
    const card = await prisma.knowledgeCard.create({
      data: {
        topic: `${TOPIC_PREFIX}${topic}`,
        syndrome: options.syndrome ?? 'febre',
        institutionId: options.institutionId ?? null,
        status: 'in_review',
        currentVersion: 1,
      },
    });
    const version = await prisma.knowledgeCardVersion.create({
      data: {
        cardId: card.id,
        version: 1,
        content: content as object,
        contentSha256,
        authorKind: 'physician',
        authorPhysicianId: reviewerId,
        reviewDecision: 'approved',
        reviewerId,
        reviewedAt: new Date(),
        validUntil: options.validUntil ?? new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    await prisma.knowledgeCard.update({
      where: { id: card.id },
      data: {
        status: options.archived ? 'archived' : 'published',
        publishedVersionId: version.id,
        ...(options.archived ? { archivedAt: new Date() } : {}),
      },
    });
    return { cardId: card.id, versionId: version.id };
  }

  async function indexRow(cardId: string) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ version_id: string; model: string | null; dims: number | null }>
    >(
      `SELECT version_id, embedding_model AS model, vector_dims(embedding) AS dims
         FROM knowledge_card_index WHERE card_id = $1::uuid`,
      cardId,
    );
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await cleanUp();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await cleanUp();
    const physician = (crmVerified: boolean, n: string) =>
      prisma.physician.create({
        data: {
          email: `revisor-${n}-${Date.now()}${EMAIL_DOMAIN}`,
          passwordHash: 'x',
          name: 'Dra. Revisora',
          crmUf: 'SP',
          crmNumber: `0406${n}`,
          crmVerified,
        },
      });
    verifiedReviewerId = (await physician(true, '01')).id;
    unverifiedReviewerId = (await physician(false, '02')).id;
    institutionId = (
      await prisma.institution.create({ data: { name: `${TOPIC_PREFIX}Hospital`, cnes: null } })
    ).id;

    embedder = keywordEmbedder();
    index = new CardIndexService(prisma as unknown as PrismaService, embedder);
  });

  it('indexa o cartão publicado com o vetor e acha o cartão certo pela consulta', async () => {
    const meningite = await publishedCard('Meningite bacteriana');
    const anafilaxia = await publishedCard('Anafilaxia');

    const report = await index.syncAll();
    expect(report).toMatchObject({ embedded: 2, withoutEmbedding: 0 });
    expect(await indexRow(meningite.cardId)).toEqual({
      version_id: meningite.versionId,
      model: 'fake-keyword-v1',
      dims: 4,
    });

    const outcome = await index.search({
      queries: ['anafilaxia com hipotensão'],
      institutionId: null,
      limitPerQuery: 5,
    });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.hits[0]).toMatchObject({ cardId: anafilaxia.cardId, similarity: 1 });
    expect(outcome.hits.find((hit) => hit.cardId === meningite.cardId)?.similarity).toBe(0);
  });

  it('nunca devolve cartão arquivado, vencido, de revisor sem CRM verificado ou de outra instituição', async () => {
    const valid = await publishedCard('Sepse');
    await publishedCard('Sepse arquivada', { archived: true });
    const expired = await publishedCard('Sepse vencida', {
      validUntil: new Date(Date.now() + 60_000),
    });
    await publishedCard('Sepse sem CRM', { reviewerId: unverifiedReviewerId });
    const institutional = await publishedCard('Sepse do hospital', { institutionId });
    await index.syncAll();
    // Venceu depois de indexado e antes da varredura: a consulta confere a validade sozinha.
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_card_index SET valid_until = now() - interval '1 minute' WHERE card_id = $1::uuid`,
      expired.cardId,
    );

    const global = await index.search({
      queries: ['sepse'],
      institutionId: null,
      limitPerQuery: 10,
    });
    const fromHospital = await index.search({
      queries: ['sepse'],
      institutionId,
      limitPerQuery: 10,
    });

    expect(global.status === 'ok' && global.hits.map((hit) => hit.cardId)).toEqual([valid.cardId]);
    expect(
      fromHospital.status === 'ok' && fromHospital.hits.map((hit) => hit.cardId).sort(),
    ).toEqual([valid.cardId, institutional.cardId].sort());
  });

  it('reindexa ao publicar versão nova e tira do índice ao arquivar e ao vencer', async () => {
    const card = await publishedCard('Meningite bacteriana');
    await index.syncCard(card.cardId);

    const v2 = await prisma.knowledgeCardVersion.create({
      data: {
        cardId: card.cardId,
        version: 2,
        content: content as object,
        contentSha256,
        authorKind: 'physician',
        authorPhysicianId: verifiedReviewerId,
        reviewDecision: 'approved',
        reviewerId: verifiedReviewerId,
        reviewedAt: new Date(),
        validUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    await prisma.knowledgeCard.update({
      where: { id: card.cardId },
      data: { currentVersion: 2, publishedVersionId: v2.id },
    });
    await index.syncCard(card.cardId);
    expect((await indexRow(card.cardId))?.version_id).toBe(v2.id);

    await prisma.knowledgeCard.update({
      where: { id: card.cardId },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await index.syncCard(card.cardId);
    expect(await indexRow(card.cardId)).toBeNull();

    const expiring = await publishedCard('Anafilaxia', {
      validUntil: new Date(Date.now() + 60_000),
    });
    await index.syncAll();
    expect(await indexRow(expiring.cardId)).not.toBeNull();

    // A validade de uma versão aprovada não muda no banco (trigger): o tempo passa no relógio.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 120_000));
      const report = await index.syncAll();
      expect(report.ineligible).toMatchObject({ expired: 1 });
    } finally {
      vi.useRealTimers();
    }
    expect(await indexRow(expiring.cardId)).toBeNull();
  });

  it('sem embedding, grava a linha sem vetor; a busca não roda; o reindex completa depois', async () => {
    embedder.enabledFlag = false;
    const card = await publishedCard('Escorpionismo');

    await index.syncCard(card.cardId);
    expect(await indexRow(card.cardId)).toEqual({
      version_id: card.versionId,
      model: null,
      dims: null,
    });
    expect(
      await index.search({ queries: ['escorpião'], institutionId: null, limitPerQuery: 5 }),
    ).toEqual({ status: 'unavailable', reason: 'embeddings_disabled' });

    embedder.enabledFlag = true;
    expect(await index.syncAll()).toMatchObject({ embedded: 1 });
    expect((await indexRow(card.cardId))?.dims).toBe(4);
  });

  it('busca só vetores do modelo atual: trocar o modelo exige reindex', async () => {
    const card = await publishedCard('Anafilaxia');
    await index.syncAll();

    const otherModel = new CardIndexService(
      prisma as unknown as PrismaService,
      keywordEmbedder('fake-keyword-v2'),
    );
    const before = await otherModel.search({
      queries: ['anafilaxia'],
      institutionId: null,
      limitPerQuery: 5,
    });
    expect(before.status === 'ok' && before.hits).toEqual([]);

    await otherModel.syncAll();
    const after = await otherModel.search({
      queries: ['anafilaxia'],
      institutionId: null,
      limitPerQuery: 5,
    });
    expect(after.status === 'ok' && after.hits.map((hit) => hit.cardId)).toEqual([card.cardId]);
  });

  it('CC-408: devolve o cartão aplicável com o revisor e o portão tira o de outra síndrome', async () => {
    const applies = await publishedCard('Meningite bacteriana');
    await publishedCard('Meningite em dor torácica', { syndrome: 'dor-toracica' });
    await index.syncAll();
    const config = new ConfigService({});
    const retrieval = new ReviewedCardRetrievalService(
      prisma as unknown as PrismaService,
      index,
      new SimilarityThemeGate(config),
      config,
    );

    const result = await retrieval.findApplicable({
      queries: ['meningite bacteriana antibiótico'],
      institutionId: null,
      syndrome: 'febre',
      hypotheses: ['Meningite bacteriana'],
      problemRepresentation: 'Adulto com febre e rigidez de nuca',
    });

    expect(result.cards.map(({ card }) => card.cardId)).toEqual([applies.cardId]);
    expect(result.cards[0]?.card).toMatchObject({
      versionId: applies.versionId,
      reviewer: { name: 'Dra. Revisora', crmUf: 'SP', crmVerified: true },
      contentSha256,
    });
    expect(result.trace).toMatchObject({
      candidates: 2,
      accepted: 1,
      rejected: { syndrome_mismatch: 1 },
    });

    const cards = new KnowledgeCardsService(
      prisma as unknown as PrismaService,
      {} as AuditService,
      index,
    );
    await expect(cards.getPublished(verifiedReviewerId, applies.cardId)).resolves.toMatchObject({
      id: applies.cardId,
      displayStatus: 'published',
      reviewer: { name: 'Dra. Revisora', crmNumber: '040601', crmUf: 'SP' },
    });
  });

  it('a role de runtime lê, grava e apaga o índice, sem TRUNCATE', async () => {
    const privileges = await prisma.$queryRawUnsafe<Array<{ privilege: string; granted: boolean }>>(
      `SELECT p.privilege, has_table_privilege($1, 'knowledge_card_index', p.privilege) AS granted
         FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(privilege)`,
      RUNTIME_ROLE,
    );

    expect(privileges.filter((row) => row.granted).map((row) => row.privilege)).toEqual([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
    ]);
  });
});
