/**
 * Testes de integração — CC-409: registro de lacunas e fila de criação de
 * cartões.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (inclusive 20261015180000_cc_409_knowledge_gap_groups) e a role
 * `copiloto_app` da AUD-002.
 *
 * Cobre o que os testes unitários não alcançam: as três fontes gravando na
 * mesma tabela pelo caminho de verdade, o `groupBy` da fila, o filtro de
 * relação da deduplicação por atendimento, os GRANTs e CHECKs do grupo, a
 * cascata da eliminação LGPD e o fechamento ao aprovar um cartão. O rascunho
 * por IA é um fake: nenhuma chamada de IA sai daqui.
 *
 * Limpa `knowledge_gaps` e `knowledge_gap_groups` inteiras: banco de teste,
 * arquivos rodando em sequência.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient, Prisma } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import type { PrismaService } from '../../src/config/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { KnowledgeGapService } from '../../src/modules/copilot/gaps/knowledge-gap.service';
import { CardIndexService } from '../../src/modules/knowledge-cards/card-index/card-index.service';
import type { KnowledgeCardDraftService } from '../../src/modules/knowledge-cards/drafting/card-draft.service';
import { KnowledgeCardsService } from '../../src/modules/knowledge-cards/knowledge-cards.service';
import { KnowledgeGapQueueService } from '../../src/modules/knowledge-gaps/knowledge-gap-queue.service';
import { KnowledgeGapsService } from '../../src/modules/knowledge-gaps/knowledge-gaps.service';
import { StoredKnowledgeGapRecorder } from '../../src/modules/quick-question/knowledge-gap-recorder';
import { storedCardContent } from '../fixtures/knowledge-cards';

const EMAIL_DOMAIN = '@cc409.test';
const RUNTIME_ROLE = 'copiloto_app';

describe('CC-409 — registro de lacunas e fila de cartões (integration)', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let gaps: KnowledgeGapsService;
  let notFound: KnowledgeGapService;
  let quickQuestion: StoredKnowledgeGapRecorder;
  let cards: KnowledgeCardsService;
  let drafts: { draft: ReturnType<typeof vi.fn> };
  let queue: KnowledgeGapQueueService;
  let physicianId: string;
  let reviewerId: string;
  let encounterId: string;

  async function cleanUp(): Promise<void> {
    await prisma.knowledgeGap.deleteMany({});
    await prisma.knowledgeGapGroup.deleteMany({});
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_cards SET status = 'archived', archived_at = now(), published_version_id = NULL
        WHERE topic LIKE 'CC-409 %'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_card_versions
        WHERE card_id IN (SELECT id FROM knowledge_cards WHERE topic LIKE 'CC-409 %')`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM knowledge_cards WHERE topic LIKE 'CC-409 %'`);
    await prisma.$executeRawUnsafe(`DELETE FROM knowledge_card_drafts WHERE topic LIKE 'CC-409 %'`);
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  async function analysis(queries: string[], syndrome = 'febre'): Promise<string> {
    const interaction = await prisma.aiInteraction.create({
      data: {
        encounterId,
        model: 'test-model',
        latencyMs: 1,
        inputRedacted: 'Homem, 45 anos, febre e rigidez de nuca. CPF [REDACTED_CPF].',
        rawOutput: { understanding: { syndrome, searchQueries: queries } },
      },
    });
    return interaction.id;
  }

  /** Rascunho e cartão em revisão do jeito que o CC-403 grava, sem chamar a IA. */
  async function cardInReview(topic: string): Promise<{ cardId: string; draftId: string }> {
    const { content, contentSha256 } = storedCardContent();
    const draft = await prisma.knowledgeCardDraft.create({
      data: {
        topic,
        syndrome: 'febre',
        status: 'completed',
        requestedModel: 'fake-model',
        promptSha256: 'a'.repeat(64),
        sourceContentSha256: 'b'.repeat(64),
        sourceChunkIds: [],
        cardsAccepted: 1,
        latencyMs: 1,
      },
    });
    const card = await prisma.knowledgeCard.create({
      data: {
        topic,
        syndrome: 'febre',
        status: 'in_review',
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            content: content as unknown as Prisma.InputJsonValue,
            contentSha256,
            authorKind: 'ai',
            draftId: draft.id,
          },
        },
      },
    });
    return { cardId: card.id, draftId: draft.id };
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    audit = new AuditService(prisma as unknown as PrismaService);
    gaps = new KnowledgeGapsService(prisma as unknown as PrismaService, audit);
    notFound = new KnowledgeGapService(prisma as unknown as PrismaService, gaps);
    quickQuestion = new StoredKnowledgeGapRecorder(gaps);
    const cardIndex = new CardIndexService(prisma as unknown as PrismaService, {
      enabled: () => false,
      identity: () => ({ provider: 'none', model: 'none' }),
      embed: () => Promise.reject(new Error('embedding desligado')),
    });
    cards = new KnowledgeCardsService(prisma as unknown as PrismaService, audit, cardIndex, gaps);
    drafts = { draft: vi.fn() };
    queue = new KnowledgeGapQueueService(
      prisma as unknown as PrismaService,
      drafts as unknown as KnowledgeCardDraftService,
      audit,
      new ConfigService({ KNOWLEDGE_CARDS_DRAFT_ENABLED: 'true' }),
    );
  });

  afterAll(async () => {
    await cleanUp();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await cleanUp();
    const physician = await prisma.physician.create({
      data: {
        email: `medico-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000409',
      },
    });
    physicianId = physician.id;
    const reviewer = await prisma.physician.create({
      data: {
        email: `revisor-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '040901',
        crmVerified: true,
        isCurator: true,
        role: 'ADMIN',
      },
    });
    reviewerId = reviewer.id;
    const encounter = await prisma.encounter.create({
      data: {
        physicianId,
        patientRef: 'CC409-001',
        context: { hasCT: true, isSus: true, hasLab: true, hasICU: false },
      },
    });
    encounterId = encounter.id;
  });

  it('knowledge_gap_groups: DML liberado à role de runtime, TRUNCATE negado', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ privilege: string; granted: boolean }>>(
      `SELECT p AS privilege, has_table_privilege($1, 'knowledge_gap_groups', p) AS granted
         FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
      RUNTIME_ROLE,
    );

    expect(Object.fromEntries(rows.map((row) => [row.privilege, row.granted]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: true,
      TRUNCATE: false,
    });
  });

  it('nem a lacuna nem o grupo têm coluna de médico', async () => {
    const columns = await prisma.$queryRawUnsafe<
      Array<{ table_name: string; column_name: string }>
    >(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_name IN ('knowledge_gaps', 'knowledge_gap_groups')`,
    );

    expect(columns.length).toBeGreaterThan(10);
    expect(columns.filter((column) => /physician|encounter/.test(column.column_name))).toEqual([]);
  });

  it('as três fontes gravam na mesma tabela e caem no mesmo grupo; a fila conta pelo banco', async () => {
    const first = await analysis(['ceftriaxona na meningite bacteriana', 'punção lombar']);
    const second = await analysis(['meningite bacteriana antibiótico ceftriaxona']);

    await notFound.reportNotFound(physicianId, encounterId, {
      interactionId: first,
      note: 'Faltou a dose; CPF 529.982.247-25',
    });
    await gaps.record({
      source: 'decision_no_card',
      interactionId: second,
      syndrome: 'febre',
      searchQueries: ['meningite bacteriana antibiótico ceftriaxona'],
      dedupeEncounterId: encounterId,
    });
    await quickQuestion.record({
      questionId: 'q-1',
      maskedQuestion: 'dose de ceftriaxona na meningite?',
      institutionId: null,
      candidates: 0,
    });

    const rows = await prisma.knowledgeGap.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((row) => row.source)).toEqual([
      'physician_not_found',
      'decision_no_card',
      'quick_question',
    ]);
    expect(new Set(rows.map((row) => row.groupId)).size).toBe(1);
    expect(JSON.stringify(rows)).not.toContain('rigidez');
    expect(rows[0]!.note).toBe('Faltou a dose; CPF [REDACTED_CPF]');

    const page = await queue.list({ limit: 20, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      syndrome: 'febre',
      severity: 'urgent',
      status: 'open',
      occurrences: 3,
      occurrencesLast7Days: 3,
      sources: { physician_not_found: 1, decision_no_card: 1, quick_question: 1 },
      notes: ['Faltou a dose; CPF [REDACTED_CPF]'],
    });

    const report = await queue.weeklyReport(new Date(Date.now() + 1000));
    expect(report).toMatchObject({
      occurrences: 3,
      bySource: { physician_not_found: 1, decision_no_card: 1, quick_question: 1 },
      newGroups: 1,
    });
    expect(report.top).toHaveLength(1);
  });

  it('a reanálise do mesmo atendimento não conta de novo (filtro pela análise → atendimento)', async () => {
    for (const interactionId of [
      await analysis(['dengue sinais de alarme']),
      await analysis(['dengue sinais de alarme']),
    ]) {
      await gaps.record({
        source: 'decision_no_card',
        interactionId,
        syndrome: 'febre',
        searchQueries: ['dengue sinais de alarme'],
        dedupeEncounterId: encounterId,
      });
    }

    expect(await prisma.knowledgeGap.count()).toBe(1);
  });

  it('eliminação LGPD: o atendimento leva as lacunas, e a varredura tira o grupo aberto vazio', async () => {
    await gaps.record({
      source: 'decision_no_card',
      interactionId: await analysis(['dengue sinais de alarme']),
      syndrome: 'febre',
      searchQueries: ['dengue sinais de alarme'],
      dedupeEncounterId: encounterId,
    });
    expect(await prisma.knowledgeGapGroup.count()).toBe(1);

    await prisma.encounter.delete({ where: { id: encounterId } });

    expect(await prisma.knowledgeGap.count()).toBe(0);
    expect((await queue.list({ limit: 20, offset: 0 })).total).toBe(0);
    await expect(gaps.maintain()).resolves.toMatchObject({ emptyGroupsRemoved: 1 });
    expect(await prisma.knowledgeGapGroup.count()).toBe(0);
  });

  it('gerar rascunho pela fila e aprovar o cartão fecha a lacuna, com a trilha', async () => {
    const { groupId } = await gaps.record({
      source: 'quick_question',
      interactionId: null,
      syndrome: null,
      searchQueries: ['adrenalina na anafilaxia'],
    });
    const { cardId, draftId } = await cardInReview('CC-409 Choque anafilático');
    drafts.draft.mockResolvedValue({
      draft: { id: draftId, status: 'completed', cardsAccepted: 1, cardsRejected: 0 },
      cardIds: [cardId],
    });

    const drafted = await queue.draft(reviewerId, groupId, { submitForReview: true });
    expect(drafted.item).toMatchObject({ status: 'drafting', draftId });

    await cards.approve(reviewerId, cardId, { version: 1 });

    const group = await prisma.knowledgeGapGroup.findUniqueOrThrow({ where: { id: groupId } });
    expect(group).toMatchObject({ status: 'covered', coveredByCardId: cardId });
    const trail = await prisma.auditLog.findFirst({
      where: { action: 'KNOWLEDGE_GAP_COVERED', entityId: groupId },
    });
    expect(trail?.payload).toMatchObject({ cardId, byDraft: true });
  });

  it('cartão global publicado fecha a lacuna do mesmo tema, sem rascunho pedido', async () => {
    const { groupId } = await gaps.record({
      source: 'quick_question',
      interactionId: null,
      syndrome: null,
      searchQueries: ['ceftriaxona na meningite bacteriana'],
    });
    const { cardId } = await cardInReview('CC-409 Meningite bacteriana');

    await cards.approve(reviewerId, cardId, { version: 1 });

    const page = await queue.list({ status: 'covered', limit: 20, offset: 0 });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: groupId,
        coveredByCard: { id: cardId, topic: 'CC-409 Meningite bacteriana' },
      }),
    ]);
  });

  it('o banco exige o cartão de "coberta" e o motivo de "descartada"', async () => {
    const { groupId } = await gaps.record({
      source: 'quick_question',
      interactionId: null,
      syndrome: null,
      searchQueries: ['adrenalina na anafilaxia'],
    });

    await expect(
      prisma.knowledgeGapGroup.update({ where: { id: groupId }, data: { status: 'covered' } }),
    ).rejects.toThrow();
    await expect(
      prisma.knowledgeGapGroup.update({ where: { id: groupId }, data: { status: 'dismissed' } }),
    ).rejects.toThrow();

    await queue.dismiss(reviewerId, groupId, { reason: 'Já existe cartão de anafilaxia' });
    expect(
      await prisma.knowledgeGapGroup.findUniqueOrThrow({ where: { id: groupId } }),
    ).toMatchObject({
      status: 'dismissed',
      dismissReason: 'Já existe cartão de anafilaxia',
    });
  });
});
