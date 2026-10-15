/**
 * Testes de integração — CC-402/CC-403/CC-412 (ADR-019): cartões revisados.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (20261014120000_cc_402_knowledge_cards) e a role `copiloto_app`
 * da AUD-002.
 *
 * Cobre o que os testes unitários não alcançam: o hash do conteúdo refeito a
 * partir do jsonb gravado, o trigger que congela o que o revisor assinou, os
 * CHECKs, os GRANTs reais e a regra anti-circularidade contra o banco. O
 * modelo é um fake: nenhuma chamada de IA sai daqui.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type { GuidelinesService } from '../../src/modules/guidelines/guidelines.service';
import { KnowledgeCardsService } from '../../src/modules/knowledge-cards/knowledge-cards.service';
import { KnowledgeCardDraftService } from '../../src/modules/knowledge-cards/drafting/card-draft.service';
import {
  hashCardContent,
  KnowledgeCardContentSchema,
} from '../../src/modules/knowledge-cards/domain/card-content';
import { findCardCircularity } from '../../evals/clinical/card-circularity';
import { DIAGNOSIS_TEXT, TREATMENT_TEXT, validCardInput } from '../fixtures/knowledge-cards';

const EMAIL_DOMAIN = '@cc402.test';
const SOURCE = 'CC-402 teste de integração';
const RUNTIME_ROLE = 'copiloto_app';

describe('CC-402 — cartões revisados (integration)', () => {
  let prisma: PrismaClient;
  let cards: KnowledgeCardsService;
  let drafts: KnowledgeCardDraftService;
  let gateway: { complete: ReturnType<typeof vi.fn> };
  let verifiedReviewerId: string;
  let unverifiedReviewerId: string;
  let chunkIds: string[];

  async function cleanUp(): Promise<void> {
    // FKs com RESTRICT nos dois sentidos: solta a versão publicada antes de apagar.
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_cards SET status = 'archived', archived_at = now(), published_version_id = NULL
        WHERE topic LIKE 'CC-402 %'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_card_versions
        WHERE card_id IN (SELECT id FROM knowledge_cards WHERE topic LIKE 'CC-402 %')`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM knowledge_cards WHERE topic LIKE 'CC-402 %'`);
    await prisma.$executeRawUnsafe(`DELETE FROM knowledge_card_drafts WHERE topic LIKE 'CC-402 %'`);
    await prisma.guidelineChunk.deleteMany({ where: { source: SOURCE } });
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
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
          crmUf: 'SP',
          crmNumber: `0004${n}`,
          crmVerified,
          isCurator: true,
          role: 'ADMIN',
        },
      });
    verifiedReviewerId = (await physician(true, '01')).id;
    unverifiedReviewerId = (await physician(false, '02')).id;

    chunkIds = [];
    for (const [text, section] of [
      [TREATMENT_TEXT, '7. TRATAMENTO'],
      [DIAGNOSIS_TEXT, '6. DIAGNÓSTICO'],
    ] as const) {
      const chunk = await prisma.guidelineChunk.create({
        data: {
          source: SOURCE,
          sourceVersion: '2024-05',
          specialty: 'infectologia',
          text,
          status: 'official_unreviewed',
          metadata: { section, url: 'https://www.gov.br/conitec/pcdt-meningite.pdf' },
        },
      });
      chunkIds.push(chunk.id);
    }

    const { sources: _sources, ...card } = validCardInput();
    gateway = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ cards: [card] }),
        model: 'claude-sonnet-5-5',
        usage: { promptTokens: 10_000, completionTokens: 1_000, totalTokens: 11_000 },
        latencyMs: 10,
      }),
    };
    const audit = new AuditService(prisma as unknown as PrismaService);
    cards = new KnowledgeCardsService(prisma as unknown as PrismaService, audit);
    drafts = new KnowledgeCardDraftService(
      prisma as unknown as PrismaService,
      gateway as unknown as AiGatewayService,
      { consult: vi.fn() } as unknown as GuidelinesService,
      audit,
      new ConfigService({ KNOWLEDGE_CARDS_DRAFT_ENABLED: 'true', AI_MODEL: 'claude-sonnet-5-5' }),
    );
  });

  async function draftOneCard(): Promise<{ cardId: string; draftId: string }> {
    const result = await drafts.draft({
      topic: 'CC-402 meningite bacteriana',
      syndrome: 'febre',
      institutionId: null,
      chunkIds,
      requestedBy: verifiedReviewerId,
      submitForReview: true,
    });
    const [cardId] = result.cardIds;
    if (!cardId) throw new Error(`nenhum cartão aceito: ${JSON.stringify(result.draft)}`);
    return { cardId, draftId: result.draft.id };
  }

  it('grava rascunho, cartão em revisão e versão 1 com o hash refeito a partir do jsonb', async () => {
    const { cardId, draftId } = await draftOneCard();

    const version = await prisma.knowledgeCardVersion.findFirstOrThrow({ where: { cardId } });
    expect(version).toMatchObject({ version: 1, authorKind: 'ai', draftId });
    // O jsonb reordena as chaves; o hash canônico não depende disso.
    expect(hashCardContent(KnowledgeCardContentSchema.parse(version.content))).toBe(
      version.contentSha256,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'KnowledgeCard', entityId: cardId, action: 'CARD_DRAFTED' },
    });
    expect(audit?.payload).toMatchObject({ draftId, contentSha256: version.contentSha256 });
  });

  it('aprovar sem CRM verificado dá 403; com CRM, publica com revisor, data, validade e hash', async () => {
    const { cardId } = await draftOneCard();

    await expect(
      cards.approve(unverifiedReviewerId, cardId, { version: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const detail = await cards.approve(verifiedReviewerId, cardId, {
      version: 1,
      comment: 'Conferido com o PCDT',
      reviewDurationMs: 41_000,
    });

    expect(detail).toMatchObject({
      status: 'published',
      displayStatus: 'published',
      published: { version: 1, reviewer: { id: verifiedReviewerId, crmVerified: true } },
    });
    const version = await prisma.knowledgeCardVersion.findFirstOrThrow({ where: { cardId } });
    expect(version).toMatchObject({
      reviewDecision: 'approved',
      reviewerId: verifiedReviewerId,
      reviewDurationMs: 41_000,
    });
    expect(version.validUntil?.getTime()).toBeGreaterThan(Date.now());
    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'KnowledgeCard', entityId: cardId, action: 'CARD_APPROVED' },
    });
    expect(audit?.payload).toMatchObject({ version: 1, contentSha256: version.contentSha256 });
  });

  it('corrigir o publicado cria a versão 2 em revisão e mantém a versão assinada', async () => {
    const { cardId } = await draftOneCard();
    await cards.approve(verifiedReviewerId, cardId, { version: 1 });
    const content = validCardInput();
    content.sources = [
      { key: 'S1', chunkId: chunkIds[0] as string },
      { key: 'S2', chunkId: chunkIds[1] as string },
    ];
    content.answer = 'Ceftriaxona 2 g IV a cada 12 horas, sem aguardar o resultado do líquor.';

    const detail = await cards.createVersion(verifiedReviewerId, cardId, {
      basedOnVersion: 1,
      content,
    });

    expect(detail).toMatchObject({
      status: 'in_review',
      currentVersion: 2,
      published: { version: 1 },
    });
    expect(detail.versions.map((version) => version.version)).toEqual([2, 1]);
  });

  it('mostra "revisar" quando a validade da aprovação venceu (CC-402, critério 3)', async () => {
    const { cardId } = await draftOneCard();
    await cards.approve(verifiedReviewerId, cardId, { version: 1 });
    // A decisão do revisor não muda depois de gravada: simular o vencimento
    // exige o dono da tabela, sem o trigger.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE knowledge_card_versions DISABLE TRIGGER knowledge_card_versions_guard',
    );
    try {
      await prisma.knowledgeCardVersion.updateMany({
        where: { cardId },
        data: { validUntil: new Date('2026-01-01T00:00:00Z') },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE knowledge_card_versions ENABLE TRIGGER knowledge_card_versions_guard',
      );
    }

    expect((await cards.get(cardId)).displayStatus).toBe('needs_review');
    const page = await cards.list({ displayStatus: 'needs_review', limit: 20, offset: 0 });
    expect(page.items.map((item) => item.id)).toContain(cardId);
  });

  describe('o banco protege o que foi assinado', () => {
    it('o trigger impede mudar o conteúdo de uma versão', async () => {
      const { cardId } = await draftOneCard();

      await expect(
        prisma.knowledgeCardVersion.updateMany({
          where: { cardId },
          data: { contentSha256: 'f'.repeat(64) },
        }),
      ).rejects.toThrow(/conteúdo e autoria de uma versão não mudam/);
    });

    it('o trigger impede regravar a decisão do revisor', async () => {
      const { cardId } = await draftOneCard();
      await cards.approve(verifiedReviewerId, cardId, { version: 1 });

      await expect(
        prisma.knowledgeCardVersion.updateMany({
          where: { cardId },
          data: { reviewDecision: 'rejected' },
        }),
      ).rejects.toThrow(/a decisão do revisor é gravada uma vez só/);
    });

    it('o CHECK impede publicado sem versão assinada', async () => {
      const { cardId } = await draftOneCard();

      await expect(
        prisma.knowledgeCard.update({ where: { id: cardId }, data: { status: 'published' } }),
      ).rejects.toThrow(/knowledge_cards_published_check/);
    });

    it('a role de runtime não apaga cartão nem versão, e só insere rascunho', async () => {
      const privileges = await prisma.$queryRawUnsafe<
        Array<{ name: string; privilege: string; granted: boolean }>
      >(
        `SELECT t.name, p.privilege, has_table_privilege($1, t.name, p.privilege) AS granted
           FROM unnest(ARRAY['knowledge_card_drafts', 'knowledge_cards', 'knowledge_card_versions']) AS t(name)
          CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(privilege)`,
        RUNTIME_ROLE,
      );
      const granted = privileges
        .filter((row) => row.granted)
        .map((row) => `${row.name}:${row.privilege}`)
        .sort();

      expect(granted).toEqual([
        'knowledge_card_drafts:INSERT',
        'knowledge_card_drafts:SELECT',
        'knowledge_card_versions:INSERT',
        'knowledge_card_versions:SELECT',
        'knowledge_card_versions:UPDATE',
        'knowledge_cards:INSERT',
        'knowledge_cards:SELECT',
        'knowledge_cards:UPDATE',
      ]);
    });
  });

  describe('anti-circularidade (CC-412)', () => {
    it('acusa caso do gabarito com o mesmo rascunho ou os mesmos trechos de um cartão', async () => {
      const { cardId, draftId } = await draftOneCard();
      const draft = await prisma.knowledgeCardDraft.findUniqueOrThrow({ where: { id: draftId } });

      const circular = await findCardCircularity(prisma, [
        { caseId: 'caso-mesmo-rascunho', origin: { draftId, sourceContentSha256: 'e'.repeat(64) } },
        {
          caseId: 'caso-mesmos-trechos',
          origin: {
            draftId: '00000000-0000-4000-8000-000000000000',
            sourceContentSha256: draft.sourceContentSha256,
          },
        },
        {
          caseId: 'caso-independente',
          origin: {
            draftId: '00000000-0000-4000-8000-000000000001',
            sourceContentSha256: 'd'.repeat(64),
          },
        },
      ]);

      expect(circular).toEqual([
        { caseId: 'caso-mesmo-rascunho', cardId, draftId, matchedBy: 'draft_id' },
        { caseId: 'caso-mesmos-trechos', cardId, draftId, matchedBy: 'source_content' },
      ]);
    });
  });
});
