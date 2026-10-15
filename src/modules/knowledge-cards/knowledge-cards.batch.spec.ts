import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { KnowledgeCardsService } from './knowledge-cards.service';
import type { CardIndexService } from './card-index/card-index.service';
import { signKnowledgeCardBatchSchema } from './schemas/knowledge-cards.schemas';

/**
 * CC-405, critério 2 — "assinar lote": só o revisor indicado, com CRM
 * verificado, publica de uma vez os cartões importados de uma ferramenta, e
 * cada cartão aprovado vai para a trilha como no aprovar um a um.
 */

const REVIEWER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_REVIEWER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-10-16T12:00:00.000Z');
const CARD_A = '11111111-1111-4111-8111-111111111111';
const CARD_B = '22222222-2222-4222-8222-222222222222';

function batchRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'in_review',
    institutionId: null,
    currentVersion: 1,
    publishedVersionId: null,
    sourceKey: `any:acls/${id.slice(0, 4)}`,
    assignedReviewerId: REVIEWER_ID,
    versions: [{ id: `v-${id}`, version: 1, contentSha256: 'f'.repeat(64), content: {} }],
    ...overrides,
  };
}

function createPrisma(rows: ReturnType<typeof batchRow>[]) {
  const prisma = {
    knowledgeCard: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeCardVersion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    physician: { findUnique: vi.fn().mockResolvedValue({ crmVerified: true }) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => unknown) =>
    run(prisma),
  );
  return prisma;
}

describe('KnowledgeCardsService.approveImportBatch (CC-405)', () => {
  let audit: { log: ReturnType<typeof vi.fn> };
  let cardIndex: { syncCard: ReturnType<typeof vi.fn> };
  const input = {
    toolId: 'acls' as const,
    items: [
      { cardId: CARD_A, version: 1 },
      { cardId: CARD_B, version: 1 },
    ],
  };

  function serviceWith(prisma: ReturnType<typeof createPrisma>) {
    return new KnowledgeCardsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      cardIndex as unknown as CardIndexService,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    audit = { log: vi.fn().mockResolvedValue({}) };
    cardIndex = { syncCard: vi.fn().mockResolvedValue(null) };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publica todos os cartões e grava um CARD_APPROVED por cartão, com o lote', async () => {
    const prisma = createPrisma([batchRow(CARD_A), batchRow(CARD_B)]);

    const result = await serviceWith(prisma).approveImportBatch(REVIEWER_ID, input);

    expect(result.approved.map((item) => item.cardId)).toEqual([CARD_A, CARD_B]);
    expect(prisma.knowledgeCardVersion.updateMany).toHaveBeenCalledWith({
      where: { id: `v-${CARD_A}`, reviewDecision: null },
      data: expect.objectContaining({
        reviewDecision: 'approved',
        reviewerId: REVIEWER_ID,
        reviewedAt: NOW,
        validUntil: new Date('2027-10-16T12:00:00.000Z'),
      }),
    });
    expect(prisma.knowledgeCard.updateMany).toHaveBeenCalledWith({
      where: { id: CARD_B, status: 'in_review', currentVersion: 1 },
      data: { status: 'published', publishedVersionId: `v-${CARD_B}` },
    });
    expect(audit.log).toHaveBeenCalledTimes(2);
    expect(audit.log.mock.calls[0]?.[0]).toMatchObject({
      actorId: REVIEWER_ID,
      action: 'CARD_APPROVED',
      entityId: CARD_A,
      payload: expect.objectContaining({
        version: 1,
        contentSha256: 'f'.repeat(64),
        batch: { batchId: result.batchId, toolId: 'acls', size: 2 },
      }),
    });
    expect(cardIndex.syncCard).toHaveBeenCalledTimes(2);
  });

  it('recusa com 403 quem não tem CRM verificado, sem gravar nada', async () => {
    const prisma = createPrisma([batchRow(CARD_A), batchRow(CARD_B)]);
    prisma.physician.findUnique.mockResolvedValue({ crmVerified: false });

    await expect(serviceWith(prisma).approveImportBatch(REVIEWER_ID, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.knowledgeCard.findMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeCardVersion.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('recusa com 403 quem não é o revisor indicado, mesmo com CRM verificado', async () => {
    const prisma = createPrisma([
      batchRow(CARD_A),
      batchRow(CARD_B, { assignedReviewerId: OTHER_REVIEWER_ID }),
    ]);

    await expect(serviceWith(prisma).approveImportBatch(REVIEWER_ID, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tudo ou nada: versão desatualizada, cartão fora da ferramenta ou já publicado recusa o lote', async () => {
    for (const problem of [
      batchRow(CARD_B, { currentVersion: 2 }),
      batchRow(CARD_B, { sourceKey: 'any:pediatria/bolus-x' }),
      batchRow(CARD_B, { sourceKey: null }),
      batchRow(CARD_B, { status: 'published' }),
    ]) {
      const prisma = createPrisma([batchRow(CARD_A), problem]);
      await expect(
        serviceWith(prisma).approveImportBatch(REVIEWER_ID, input),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('cartão que mudou durante a gravação desfaz o lote', async () => {
    const prisma = createPrisma([batchRow(CARD_A), batchRow(CARD_B)]);
    prisma.knowledgeCard.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(serviceWith(prisma).approveImportBatch(REVIEWER_ID, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('signKnowledgeCardBatchSchema', () => {
  it('exige ferramenta conhecida, ao menos um cartão e nenhum repetido', () => {
    expect(
      signKnowledgeCardBatchSchema.safeParse({
        toolId: 'acls',
        items: [{ cardId: CARD_A, version: 1 }],
      }).success,
    ).toBe(true);
    expect(signKnowledgeCardBatchSchema.safeParse({ toolId: 'tep', items: [] }).success).toBe(
      false,
    );
    expect(
      signKnowledgeCardBatchSchema.safeParse({
        toolId: 'acls',
        items: [
          { cardId: CARD_A, version: 1 },
          { cardId: CARD_A, version: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});
