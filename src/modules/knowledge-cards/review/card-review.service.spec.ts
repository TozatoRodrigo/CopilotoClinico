import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../config/prisma.service';
import type {
  KnowledgeCardContent,
  KnowledgeCardDetail,
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
const INSTITUTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = '2026-10-15T12:00:00.000Z';

function content(): KnowledgeCardContent {
  const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });
  if (!prepared.ok) throw new Error('fixture inválida');
  return prepared.content;
}

function detail(version = 1): KnowledgeCardDetail {
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
  };
}

function createDeps() {
  const chunks = sourceChunks();
  const prisma = {
    knowledgeCard: {
      count: vi.fn().mockResolvedValue(3),
      findFirst: vi.fn().mockResolvedValue({ id: CARD_ID, status: 'in_review' }),
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
  return { prisma, cards, service, chunks };
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
      expect(queue.pending).toBe(3);
      expect(queue.item).toMatchObject({ kind: 'review', version: 1, card: { id: CARD_ID } });
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
        pending: 0,
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
