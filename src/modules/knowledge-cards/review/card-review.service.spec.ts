import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../config/prisma.service';
import type {
  KnowledgeCardContent,
  KnowledgeCardDetail,
  KnowledgeCardPhysicianRef,
} from '../../../shared/contracts/knowledge-cards';
import {
  DIAGNOSIS_CHUNK_ID,
  sourceChunks,
  TREATMENT_CHUNK_ID,
  TREATMENT_TEXT,
  validCardInput,
} from '../../../../tests/fixtures/knowledge-cards';
import { prepareCardContent } from '../card-sources';
import type { KnowledgeCardsService } from '../knowledge-cards.service';
import { CardReviewService } from './card-review.service';

const CARD_ID = '88888888-8888-4888-8888-888888888888';
const REVIEWER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FIRST_REVIEWER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const INSTITUTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CROSS_REVIEW_ID = 'abababab-abab-4bab-8bab-abababababab';
const NOW = '2026-10-15T12:00:00.000Z';
const APPROVED_AT = new Date('2026-10-10T12:00:00.000Z');
const VALID_UNTIL = new Date('2027-10-10T12:00:00.000Z');

function physician(id: string, name: string): KnowledgeCardPhysicianRef {
  return { id, name, crmUf: 'SP', crmNumber: '123456', crmVerified: true };
}

function content(): KnowledgeCardContent {
  const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });
  if (!prepared.ok) throw new Error('fixture inválida');
  return prepared.content;
}

function detail(version = 1, overrides: Partial<KnowledgeCardDetail> = {}): KnowledgeCardDetail {
  return {
    id: CARD_ID,
    institutionId: null,
    topic: 'Meningite bacteriana',
    syndrome: 'febre',
    status: 'in_review',
    displayStatus: 'in_review',
    currentVersion: version,
    question: content().question,
    published: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    versions: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        version,
        content: content(),
        contentSha256: 'c'.repeat(64),
        authorKind: 'ai',
        authorPhysician: null,
        draft: null,
        review: null,
        createdAt: NOW,
      },
    ],
    ...overrides,
  };
}

/** Revisão cruzada pendente, como o `findFirst` da fila devolve. */
function crossReviewTask() {
  return {
    id: CROSS_REVIEW_ID,
    cardId: CARD_ID,
    version: { version: 1, reviewedAt: APPROVED_AT, validUntil: VALID_UNTIL },
    firstReviewer: physician(FIRST_REVIEWER_ID, 'Dr. Primeiro'),
  };
}

function createDeps() {
  const chunks = sourceChunks();
  let pendingTask: ReturnType<typeof crossReviewTask> | null = null;
  let diverged: Record<string, unknown> | null = null;
  const prisma = {
    knowledgeCard: {
      count: vi.fn().mockResolvedValue(3),
      findFirst: vi.fn().mockResolvedValue({ id: CARD_ID, status: 'in_review' }),
    },
    knowledgeCardCrossReview: {
      count: vi.fn().mockResolvedValue(0),
      // A fila pergunta pela pendente; a vista do cartão, pela divergência.
      findFirst: vi.fn(async ({ where }: { where: { status?: string } }) =>
        where.status === 'diverged' ? diverged : pendingTask,
      ),
    },
    physicianInstitution: { findMany: vi.fn().mockResolvedValue([]) },
    guidelineChunk: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) => {
          const chunk = chunks.get(id);
          return chunk ? [chunk] : [];
        }),
      ),
    },
  };
  const cards = {
    get: vi.fn().mockResolvedValue(detail()),
    createVersion: vi.fn().mockResolvedValue(detail(2)),
    approve: vi.fn().mockResolvedValue(detail()),
    reject: vi.fn().mockResolvedValue(detail()),
  };
  const service = new CardReviewService(
    prisma as unknown as PrismaService,
    cards as unknown as KnowledgeCardsService,
  );
  return {
    prisma,
    cards,
    service,
    chunks,
    setPendingCrossReview: (task: ReturnType<typeof crossReviewTask> | null) => {
      pendingTask = task;
    },
    setDiverged: (row: Record<string, unknown> | null) => {
      diverged = row;
    },
  };
}

describe('CardReviewService', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  describe('next — a fila', () => {
    it('traz o cartão em revisão que espera há mais tempo, no escopo do revisor', async () => {
      deps.prisma.physicianInstitution.findMany.mockResolvedValue([
        { institutionId: INSTITUTION_ID },
      ]);

      const queue = await deps.service.next(REVIEWER_ID, { skip: [] });

      const scope = {
        OR: [{ institutionId: null }, { institutionId: { in: [INSTITUTION_ID] } }],
      };
      expect(deps.prisma.knowledgeCard.findFirst).toHaveBeenCalledWith({
        where: { AND: [scope, { status: 'in_review' }] },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      expect(queue.pending).toEqual({ review: 3, crossReview: 0 });
      expect(queue.item).toMatchObject({
        kind: 'review',
        version: 1,
        card: { id: CARD_ID },
        divergence: null,
      });
    });

    it('sem vínculo com instituição, só cartões globais', async () => {
      await deps.service.next(REVIEWER_ID, { skip: [] });

      expect(deps.prisma.knowledgeCard.count).toHaveBeenCalledWith({
        where: { AND: [{ institutionId: null }, { status: 'in_review' }] },
      });
    });

    it('deixa de fora os cartões pulados, mas conta todos como pendentes', async () => {
      const skipped = ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'];

      await deps.service.next(REVIEWER_ID, { skip: skipped });

      const inQueue = { AND: [{ institutionId: null }, { status: 'in_review' }] };
      expect(deps.prisma.knowledgeCard.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [inQueue, { id: { notIn: skipped } }] } }),
      );
      expect(deps.prisma.knowledgeCard.count).toHaveBeenCalledWith({ where: inQueue });
    });

    it('fila vazia: sem item', async () => {
      deps.prisma.knowledgeCard.findFirst.mockResolvedValue(null);
      deps.prisma.knowledgeCard.count.mockResolvedValue(0);

      await expect(deps.service.next(REVIEWER_ID, { skip: [] })).resolves.toEqual({
        item: null,
        pending: { review: 0, crossReview: 0 },
      });
      expect(deps.cards.get).not.toHaveBeenCalled();
    });

    it('entrega o texto integral de cada fonte com os trechos citados destacados', async () => {
      const queue = await deps.service.next(REVIEWER_ID, { skip: [] });

      const [treatment, diagnosis] = queue.item?.sourceTexts ?? [];
      expect(treatment).toMatchObject({
        key: 'S1',
        chunkId: TREATMENT_CHUNK_ID,
        text: TREATMENT_TEXT,
        matchesCitedText: true,
      });
      const marked = treatment!.highlights.map((range) =>
        TREATMENT_TEXT.slice(range.start, range.end),
      );
      expect(marked).toEqual([
        'iniciar antibioticoterapia empírica imediatamente após a coleta do líquor',
        'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia',
      ]);
      expect(diagnosis).toMatchObject({ key: 'S2', chunkId: DIAGNOSIS_CHUNK_ID });
      expect(diagnosis!.highlights).toHaveLength(1);
    });

    it('avisa quando o texto da fonte mudou depois da citação, e quando sumiu', async () => {
      const changed = deps.chunks.get(TREATMENT_CHUNK_ID)!;
      deps.prisma.guidelineChunk.findMany.mockResolvedValue([
        { ...changed, text: `${changed.text} Texto acrescentado depois.` },
      ]);

      const queue = await deps.service.next(REVIEWER_ID, { skip: [] });

      expect(queue.item?.sourceTexts[0]).toMatchObject({ key: 'S1', matchesCitedText: false });
      expect(queue.item?.sourceTexts[1]).toEqual({
        key: 'S2',
        chunkId: DIAGNOSIS_CHUNK_ID,
        text: null,
        matchesCitedText: false,
        highlights: [],
      });
    });
  });

  describe('next — revisão cruzada (CC-411)', () => {
    it('vem antes da revisão comum: é cartão no ar', async () => {
      deps.setPendingCrossReview(crossReviewTask());
      deps.prisma.knowledgeCardCrossReview.count.mockResolvedValue(2);
      deps.cards.get.mockResolvedValue(detail(1, { status: 'published' }));

      const queue = await deps.service.next(REVIEWER_ID, { skip: [] });

      expect(queue.pending).toEqual({ review: 3, crossReview: 2 });
      expect(queue.item).toMatchObject({
        kind: 'cross_review',
        version: 1,
        crossReview: {
          id: CROSS_REVIEW_ID,
          firstReviewer: { name: 'Dr. Primeiro' },
          approvedAt: APPROVED_AT.toISOString(),
          validUntil: VALID_UNTIL.toISOString(),
        },
      });
      expect(queue.item?.sourceTexts).toHaveLength(2);
      expect(deps.prisma.knowledgeCard.findFirst).not.toHaveBeenCalled();
    });

    it('só oferece ao segundo médico: nem quem aprovou nem quem escreveu, e com a versão no ar', async () => {
      await deps.service.next(REVIEWER_ID, { skip: [] });

      expect(deps.prisma.knowledgeCardCrossReview.findFirst).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          firstReviewerId: { not: REVIEWER_ID },
          OR: [{ versionAuthorId: null }, { versionAuthorId: { not: REVIEWER_ID } }],
          card: { AND: [{ institutionId: null }, { status: 'published' }] },
          version: { publishedOf: { isNot: null } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: expect.any(Object),
      });
    });

    it('cartão que voltou à fila por divergência mostra de quem e por quê', async () => {
      deps.setDiverged({
        id: CROSS_REVIEW_ID,
        comment: 'A dose máxima é por dia, não por tomada',
        reviewedAt: APPROVED_AT,
        version: { version: 1 },
        firstReviewer: physician(FIRST_REVIEWER_ID, 'Dr. Primeiro'),
        reviewer: physician(REVIEWER_ID, 'Dra. Segunda'),
      });
      deps.cards.get.mockResolvedValue(detail(2));

      const queue = await deps.service.next(REVIEWER_ID, { skip: [] });

      expect(queue.item).toMatchObject({
        kind: 'review',
        divergence: {
          crossReviewId: CROSS_REVIEW_ID,
          disputedVersion: 1,
          firstReviewer: { name: 'Dr. Primeiro' },
          crossReviewer: { name: 'Dra. Segunda' },
          reason: 'A dose máxima é por dia, não por tomada',
        },
      });
    });
  });

  describe('decisões — só sobre cartão da fila do revisor', () => {
    const approve = { version: 1, reviewDurationMs: 95_000 };

    it('aprova pelo serviço do cartão, com o revisor e o tempo medido', async () => {
      await deps.service.approve(REVIEWER_ID, CARD_ID, approve);

      expect(deps.cards.approve).toHaveBeenCalledWith(REVIEWER_ID, CARD_ID, approve);
    });

    it('descarta com motivo pelo serviço do cartão', async () => {
      const reject = { version: 1, reason: 'Dose fora do contexto da fonte', reviewDurationMs: 1 };

      await deps.service.reject(REVIEWER_ID, CARD_ID, reject);

      expect(deps.cards.reject).toHaveBeenCalledWith(REVIEWER_ID, CARD_ID, reject);
    });

    it('corrige e devolve a vista da versão nova, com as fontes', async () => {
      deps.cards.get.mockResolvedValue(detail(2));
      const input = { basedOnVersion: 1, content: validCardInput() };

      const item = await deps.service.correct(REVIEWER_ID, CARD_ID, input);

      expect(deps.cards.createVersion).toHaveBeenCalledWith(REVIEWER_ID, CARD_ID, input);
      expect(item.version).toBe(2);
      expect(item.sourceTexts).toHaveLength(2);
    });

    it('cartão fora do escopo do revisor responde como inexistente', async () => {
      deps.prisma.knowledgeCard.findFirst.mockResolvedValue(null);

      await expect(deps.service.approve(REVIEWER_ID, CARD_ID, approve)).rejects.toThrow(
        NotFoundException,
      );
      expect(deps.cards.approve).not.toHaveBeenCalled();
    });

    it('cartão que já saiu da fila (outro revisor decidiu): 409', async () => {
      deps.prisma.knowledgeCard.findFirst.mockResolvedValue({ status: 'published' });

      await expect(deps.service.approve(REVIEWER_ID, CARD_ID, approve)).rejects.toThrow(
        ConflictException,
      );
      await expect(
        deps.service.correct(REVIEWER_ID, CARD_ID, { basedOnVersion: 1, content: {} }),
      ).rejects.toThrow(ConflictException);
      expect(deps.cards.approve).not.toHaveBeenCalled();
      expect(deps.cards.createVersion).not.toHaveBeenCalled();
    });
  });
});
