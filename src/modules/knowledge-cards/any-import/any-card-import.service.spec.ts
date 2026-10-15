import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../config/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { anyCardDrafts } from './any-card-catalog';
import { AnyCardImportService } from './any-card-import.service';
import { EMPTY_FINDINGS } from './review-findings';

/**
 * CC-405 — idempotência da importação contra um banco em memória: reimportar
 * não duplica, conteúdo novo vira versão nova, arquivado fica arquivado.
 */

const REVIEWER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface CardRow {
  id: string;
  sourceKey: string | null;
  status: 'draft' | 'in_review' | 'published' | 'archived';
  currentVersion: number;
  publishedVersionId: string | null;
  assignedReviewerId: string | null;
  topic: string;
}

interface VersionRow {
  id: string;
  cardId: string;
  version: number;
  contentSha256: string;
  authorKind: string;
  importId: string | null;
  reviewFlags: unknown;
}

function createDb() {
  const cards: CardRow[] = [];
  const versions: VersionRow[] = [];
  const imports: Array<Record<string, unknown>> = [];
  const latest = (cardId: string) =>
    versions.filter((row) => row.cardId === cardId).sort((a, b) => b.version - a.version)[0];

  const prisma = {
    physician: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === REVIEWER_ID ? { id: REVIEWER_ID } : null,
      ),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    knowledgeCard: {
      findMany: vi.fn(async ({ where }: { where: { sourceKey: { in: string[] } } }) =>
        cards
          .filter((card) => card.sourceKey && where.sourceKey.in.includes(card.sourceKey))
          .map((card) => ({
            ...card,
            versions: [{ contentSha256: latest(card.id)?.contentSha256 }],
          })),
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: CardRow & { versions: { create: Omit<VersionRow, 'id' | 'cardId'> } };
        }) => {
          const { versions: nested, ...card } = data;
          cards.push({ ...card, publishedVersionId: null });
          versions.push({ ...nested.create, id: randomUUID(), cardId: card.id });
          return { id: card.id };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status: string; currentVersion: number };
          data: Partial<CardRow>;
        }) => {
          const card = cards.find(
            (row) =>
              row.id === where.id &&
              row.status === where.status &&
              row.currentVersion === where.currentVersion,
          );
          if (!card) return { count: 0 };
          Object.assign(card, data);
          return { count: 1 };
        },
      ),
    },
    knowledgeCardVersion: {
      create: vi.fn(async ({ data }: { data: Omit<VersionRow, 'id'> }) => {
        versions.push({ ...data, id: randomUUID() });
        return {};
      }),
    },
    knowledgeCardImport: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        imports.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (run: (tx: typeof prisma) => unknown) =>
    run(prisma),
  );
  return { prisma, cards, versions, imports };
}

describe('AnyCardImportService (CC-405)', () => {
  let db: ReturnType<typeof createDb>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: AnyCardImportService;
  const request = {
    toolId: 'acls' as const,
    reviewerId: REVIEWER_ID,
    findings: EMPTY_FINDINGS,
    requestedBy: null,
  };
  const aclsCount = anyCardDrafts('acls').length;

  beforeEach(() => {
    db = createDb();
    audit = { log: vi.fn().mockResolvedValue({}) };
    service = new AnyCardImportService(
      db.prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('cria um cartão em revisão por item, com o revisor indicado e a versão importada', async () => {
    const result = await service.import(request);

    expect(result.created).toHaveLength(aclsCount);
    expect(result.rejections).toEqual([]);
    expect(db.cards.every((card) => card.status === 'in_review')).toBe(true);
    expect(db.cards.every((card) => card.assignedReviewerId === REVIEWER_ID)).toBe(true);
    expect(db.cards.map((card) => card.sourceKey)).toContain('any:acls/epinefrina');
    expect(
      db.versions.every((row) => row.authorKind === 'import' && row.importId === result.importId),
    ).toBe(true);
    expect(db.imports[0]).toMatchObject({
      id: result.importId,
      toolId: 'acls',
      anyCommits: ['95c8fba'],
      cardsCreated: aclsCount,
    });
    expect(audit.log).toHaveBeenCalledTimes(aclsCount);
    expect(audit.log.mock.calls[0]?.[0]).toMatchObject({
      actorId: 'system',
      action: 'CARD_IMPORTED',
      payload: expect.objectContaining({ importId: result.importId, version: 1, to: 'in_review' }),
    });
  });

  it('reimportar o mesmo conteúdo não duplica nem cria versão', async () => {
    await service.import(request);
    audit.log.mockClear();

    const again = await service.import(request);

    expect(again.created).toEqual([]);
    expect(again.unchanged).toHaveLength(aclsCount);
    expect(db.cards).toHaveLength(aclsCount);
    expect(db.versions).toHaveLength(aclsCount);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('conteúdo que mudou vira versão nova e volta para revisão; a publicada segue valendo', async () => {
    await service.import(request);
    const card = db.cards.find((row) => row.sourceKey === 'any:acls/epinefrina')!;
    // O cartão foi assinado sobre o conteúdo antigo do motor.
    card.status = 'published';
    card.publishedVersionId = 'versao-assinada';
    db.versions.find((row) => row.cardId === card.id)!.contentSha256 = 'a'.repeat(64);

    const result = await service.import(request);

    expect(result.updated).toEqual(['any:acls/epinefrina']);
    expect(card).toMatchObject({
      status: 'in_review',
      currentVersion: 2,
      publishedVersionId: 'versao-assinada',
    });
    expect(db.versions.filter((row) => row.cardId === card.id).map((row) => row.version)).toEqual([
      1, 2,
    ]);
  });

  it('cartão arquivado não volta com a reimportação', async () => {
    await service.import(request);
    const card = db.cards.find((row) => row.sourceKey === 'any:acls/lidocaina')!;
    card.status = 'archived';
    db.versions.find((row) => row.cardId === card.id)!.contentSha256 = 'b'.repeat(64);

    const result = await service.import(request);

    expect(result.skipped).toEqual(['any:acls/lidocaina']);
    expect(card.status).toBe('archived');
    expect(card.currentVersion).toBe(1);
  });

  it('cartão que mudou no meio da importação desfaz a importação inteira', async () => {
    await service.import(request);
    db.versions.forEach((row) => {
      row.contentSha256 = 'c'.repeat(64);
    });
    db.prisma.knowledgeCard.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.import(request)).rejects.toThrow(/KNOWLEDGE_CARD_IMPORT_CONFLICT/);
  });

  it('revisor inexistente é recusado antes de tocar nos cartões', async () => {
    await expect(service.import({ ...request, reviewerId: randomUUID() })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.prisma.knowledgeCard.findMany).not.toHaveBeenCalled();
  });

  describe('findReviewer', () => {
    const reviewer = {
      id: REVIEWER_ID,
      name: 'Gustavo Moreira',
      crmUf: 'SP',
      crmNumber: '1',
      crmVerified: true,
    };

    it('pelo CRM informado', async () => {
      db.prisma.physician.findFirst.mockResolvedValue(reviewer);
      await expect(service.findReviewer({ uf: 'SP', number: '1' })).resolves.toEqual(reviewer);
      expect(db.prisma.physician.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { crmUf: 'SP', crmNumber: '1' } }),
      );
    });

    it('sem CRM, só quando um único médico tem o nome do autor do ANY', async () => {
      db.prisma.physician.findMany.mockResolvedValueOnce([reviewer]);
      await expect(service.findReviewer(null)).resolves.toEqual(reviewer);

      db.prisma.physician.findMany.mockResolvedValueOnce([reviewer, { ...reviewer, id: 'outro' }]);
      await expect(service.findReviewer(null)).rejects.toThrow(/Mais de um/);

      db.prisma.physician.findMany.mockResolvedValueOnce([]);
      await expect(service.findReviewer(null)).rejects.toThrow(/Nenhum/);
    });
  });
});
