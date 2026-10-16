import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import {
  currentRequestContext,
  runWithRequestContext,
} from '../../shared/request-context/request-context';
import {
  analysisRow,
  OTHER_PHYSICIAN_ID,
  PHYSICIAN_ID,
  reviewQuestionsWire,
  sepsisAnalysis,
} from '../../../tests/fixtures/shift-review';
import { NoCardSource } from './card-material';
import { buildReviewMaterial, type ReviewMaterial } from './review-material';
import type {
  ReviewGenerationOutcome,
  ReviewQuestionGenerator,
} from './review-question-generator.service';
import { checkReviewQuestions, ReviewQuestionsOutputSchema } from './review-questions.schema';
import { ShiftReviewService } from './shift-review.service';
import { MAX_GENERATION_ATTEMPTS } from './shift-review.settings';

const NOW = new Date('2026-10-15T15:00:00Z');
const PERIOD_START = new Date('2026-10-12T00:00:00Z');
const REVIEW_ID = '40000000-0000-4000-8000-000000000001';
const QUESTION_ID = '50000000-0000-4000-8000-000000000001';

const headache = analysisRow();
const sepsis = analysisRow({
  rawOutput: sepsisAnalysis(),
  createdAt: new Date('2026-10-13T12:00:00Z'),
});

function interactionRecord(row: typeof headache) {
  return {
    id: row.interactionId,
    encounterId: row.encounterId,
    rawOutput: row.rawOutput,
    createdAt: row.createdAt,
    encounter: { patientRef: row.patientRef },
  };
}

function generatedFrom(material: ReviewMaterial): ReviewGenerationOutcome {
  const output = ReviewQuestionsOutputSchema.parse(reviewQuestionsWire());
  return {
    kind: 'generated',
    questions: checkReviewQuestions(output, material).accepted,
    model: 'claude-sonnet-5-5',
    cost: 0.007,
    latencyMs: 900,
  };
}

type QuestionRow = {
  id: string;
  reviewId: string;
  physicianId: string;
  encounterId: string;
  interactionId: string;
  position: number;
  format: 'multiple_choice' | 'true_false';
  stem: string;
  options: string[];
  correctOption: number;
  explanation: string;
  topic: string;
  syndrome: string | null;
  source: Record<string, unknown>;
  cardId: string | null;
  chosenOption: number | null;
  confidence: 'know' | 'unsure' | 'guessed' | null;
  correct: boolean | null;
  answeredAt: Date | null;
  createdAt: Date;
  encounter: { chiefComplaint: string | null };
};

function questionRow(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: QUESTION_ID,
    reviewId: REVIEW_ID,
    physicianId: PHYSICIAN_ID,
    encounterId: headache.encounterId,
    interactionId: headache.interactionId,
    position: 0,
    format: 'multiple_choice',
    stem: 'Em adulto com cefaleia súbita e intensa, qual é o exame inicial?',
    options: ['TC de crânio sem contraste', 'Punção lombar', 'Ressonância', 'Nenhum'],
    correctOption: 0,
    explanation: 'A fonte orienta TC sem contraste.',
    topic: 'Cefaleia em trovoada',
    syndrome: 'cefaleia',
    source: {
      kind: 'analysis_citation',
      chunkId: 'chunk-hsa-1',
      title: 'Diretriz de cefaleia na emergência',
      version: '2024',
      origin: 'official_unreviewed',
      url: 'https://example.org/cefaleia.pdf',
      excerpt: 'Na cefaleia em trovoada, a TC…',
    },
    cardId: null,
    chosenOption: null,
    confidence: null,
    correct: null,
    answeredAt: null,
    createdAt: NOW,
    encounter: { chiefComplaint: 'Cefaleia súbita' },
    ...overrides,
  };
}

function reviewRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    physicianId: PHYSICIAN_ID,
    periodStart: PERIOD_START,
    status: 'ready',
    trigger: 'on_demand',
    windowStart: new Date('2026-10-08T15:00:00Z'),
    windowEnd: NOW,
    analysisCount: 2,
    attempts: 1,
    model: 'claude-sonnet-5-5',
    cost: 0.007,
    latencyMs: 900,
    failureReason: null,
    generatedAt: NOW,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    questions: [questionRow()],
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    shiftReview: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(reviewRecord()),
      create: vi.fn().mockResolvedValue({ id: REVIEW_ID }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    shiftReviewQuestion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
      createMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    aiInteraction: {
      findFirst: vi.fn().mockResolvedValue({ id: headache.interactionId }),
      findMany: vi.fn().mockResolvedValue([interactionRecord(headache), interactionRecord(sepsis)]),
    },
    encounter: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((operations: unknown[]) => Promise.all(operations)),
  };
}

describe('ShiftReviewService', () => {
  let env: Record<string, string>;
  let prisma: ReturnType<typeof createPrismaMock>;
  let generate: ReturnType<typeof vi.fn>;
  let service: ShiftReviewService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    env = { COPILOT_SHIFT_REVIEW: 'true' };
    prisma = createPrismaMock();
    generate = vi
      .fn()
      .mockImplementation(async (material: ReviewMaterial) => generatedFrom(material));
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    service = new ShiftReviewService(
      prisma as unknown as PrismaService,
      config,
      { generate } as unknown as ReviewQuestionGenerator,
      new NoCardSource(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('flag COPILOT_SHIFT_REVIEW', () => {
    it('is off by default: no query, no generation', async () => {
      delete env.COPILOT_SHIFT_REVIEW;

      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'disabled' });
      expect(await service.start(PHYSICIAN_ID)).toEqual({ status: 'disabled' });
      await expect(
        service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 0, confidence: 'know' }),
      ).rejects.toThrow(NotFoundException);
      expect(await service.generateWeekly()).toEqual({ generated: 0, failed: 0 });
      expect(prisma.shiftReview.findUnique).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    });
  });

  describe('getCurrent', () => {
    it('looks up only the physician review of this week', async () => {
      await service.getCurrent(PHYSICIAN_ID);

      expect(prisma.shiftReview.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            physicianId_periodStart: { physicianId: PHYSICIAN_ID, periodStart: PERIOD_START },
          },
        }),
      );
    });

    it('is available when the physician had an analysis in the last 7 days', async () => {
      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'available' });
      expect(prisma.aiInteraction.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          createdAt: { gt: new Date('2026-10-08T15:00:00Z') },
          encounter: { physicianId: PHYSICIAN_ID, status: { not: 'cancelled' } },
        }),
        select: { id: true },
      });
    });

    it('is unavailable without analyses', async () => {
      prisma.aiInteraction.findFirst.mockResolvedValue(null);

      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'unavailable' });
    });

    it('hides the answer key until the question is answered', async () => {
      prisma.shiftReview.findUnique.mockResolvedValue(reviewRecord());

      const state = await service.getCurrent(PHYSICIAN_ID);

      expect(state.status).toBe('ready');
      if (state.status !== 'ready') return;
      const [question] = state.review.questions;
      expect(question?.answer).toBeNull();
      expect(JSON.stringify(state)).not.toContain('A fonte orienta');
      expect(JSON.stringify(state)).not.toContain('correctOption');
    });

    it('is completed when every question has an answer', async () => {
      prisma.shiftReview.findUnique.mockResolvedValue(
        reviewRecord({
          questions: [
            questionRow({
              chosenOption: 1,
              confidence: 'guessed',
              correct: false,
              answeredAt: NOW,
            }),
          ],
        }),
      );

      const state = await service.getCurrent(PHYSICIAN_ID);

      expect(state.status).toBe('completed');
      if (state.status !== 'completed') return;
      expect(state.review.questions[0]?.answer).toMatchObject({
        chosenOption: 1,
        correctOption: 0,
        correct: false,
        explanation: 'A fonte orienta TC sem contraste.',
        source: { title: 'Diretriz de cefaleia na emergência', version: '2024' },
        caseTitle: 'Cefaleia súbita',
      });
      expect(state.review.summary.byConfidence.guessed).toEqual({ answered: 1, correct: 0 });
    });

    it('is generating while a recent generation runs', async () => {
      prisma.shiftReview.findUnique.mockResolvedValue(
        reviewRecord({ status: 'generating', questions: [] }),
      );

      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'generating' });
    });

    it('offers a new attempt after a failure, up to the weekly ceiling', async () => {
      prisma.shiftReview.findUnique.mockResolvedValue(
        reviewRecord({ status: 'failed', failureReason: 'refusal', questions: [] }),
      );
      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'available' });

      prisma.shiftReview.findUnique.mockResolvedValue(
        reviewRecord({ status: 'failed', attempts: MAX_GENERATION_ATTEMPTS, questions: [] }),
      );
      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'unavailable' });
    });

    it('after "no material", is available again only when a new analysis arrives', async () => {
      const failedAt = new Date('2026-10-14T10:00:00Z');
      prisma.shiftReview.findUnique.mockResolvedValue(
        reviewRecord({
          status: 'failed',
          failureReason: 'no_material',
          updatedAt: failedAt,
          questions: [],
        }),
      );
      prisma.aiInteraction.findFirst.mockResolvedValue(null);

      expect(await service.getCurrent(PHYSICIAN_ID)).toEqual({ status: 'unavailable' });
      expect(prisma.aiInteraction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: { gt: failedAt } }),
        }),
      );
    });
  });

  describe('start', () => {
    it('creates the review and generates the questions in the background', async () => {
      expect(await service.start(PHYSICIAN_ID)).toEqual({ status: 'generating' });
      await service.settle();

      expect(prisma.shiftReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          physicianId: PHYSICIAN_ID,
          periodStart: PERIOD_START,
          status: 'generating',
          trigger: 'on_demand',
        }),
        select: { id: true },
      });
      // Material só das análises do próprio médico.
      expect(prisma.aiInteraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            encounter: { physicianId: PHYSICIAN_ID, status: { not: 'cancelled' } },
          }),
        }),
      );
      const { data } = prisma.shiftReviewQuestion.createMany.mock.calls[0]![0] as {
        data: Array<Record<string, unknown>>;
      };
      expect(data).toHaveLength(3);
      expect(data[0]).toMatchObject({
        reviewId: REVIEW_ID,
        physicianId: PHYSICIAN_ID,
        encounterId: headache.encounterId,
        interactionId: headache.interactionId,
        position: 0,
        syndrome: 'cefaleia',
        cardId: null,
        source: { kind: 'analysis_citation', chunkId: 'chunk-hsa-1' },
      });
      expect(data[2]).toMatchObject({
        encounterId: sepsis.encounterId,
        syndrome: 'febre-hipotensao',
        source: { title: 'Protocolo de sepse' },
      });
      expect(prisma.shiftReview.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: expect.objectContaining({
          status: 'ready',
          analysisCount: 2,
          model: 'claude-sonnet-5-5',
          cost: 0.007,
        }),
      });
    });

    it('keeps the request context (requestId and physician) in the background generation', async () => {
      let context: unknown;
      generate.mockImplementation(async (material: ReviewMaterial) => {
        context = currentRequestContext();
        return generatedFrom(material);
      });
      await runWithRequestContext(
        { requestId: 'req-1', physicianId: PHYSICIAN_ID, encounterId: null },
        () => service.start(PHYSICIAN_ID),
      );
      await service.settle();

      expect(context).toEqual({ requestId: 'req-1', physicianId: PHYSICIAN_ID, encounterId: null });
    });

    it('returns the existing state when another request created the review first', async () => {
      prisma.shiftReview.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prisma.shiftReview.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(reviewRecord({ status: 'generating', questions: [] }));

      expect(await service.start(PHYSICIAN_ID)).toEqual({ status: 'generating' });
      expect(generate).not.toHaveBeenCalled();
    });

    it('does not regenerate a ready review', async () => {
      prisma.shiftReview.findUnique.mockResolvedValue(reviewRecord());

      const state = await service.start(PHYSICIAN_ID);

      expect(state.status).toBe('ready');
      expect(prisma.shiftReview.updateMany).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    });

    it('claims a failed review with optimistic concurrency and tries again', async () => {
      const failed = reviewRecord({ status: 'failed', failureReason: 'refusal', questions: [] });
      prisma.shiftReview.findUnique.mockResolvedValue(failed);

      expect(await service.start(PHYSICIAN_ID)).toEqual({ status: 'generating' });
      await service.settle();

      expect(prisma.shiftReview.updateMany).toHaveBeenCalledWith({
        where: { id: REVIEW_ID, status: 'failed', updatedAt: failed.updatedAt },
        data: expect.objectContaining({ status: 'generating', attempts: { increment: 1 } }),
      });
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it('marks "no_material" when no analysis cited a source', async () => {
      const output = sepsisAnalysis();
      prisma.aiInteraction.findMany.mockResolvedValue([
        interactionRecord(analysisRow({ rawOutput: { ...output, recommendations: [] } })),
      ]);

      await service.start(PHYSICIAN_ID);
      await service.settle();

      expect(generate).not.toHaveBeenCalled();
      expect(prisma.shiftReview.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: { status: 'failed', failureReason: 'no_material', analysisCount: 0 },
      });
    });

    it('records the failure reason, cost and model of a failed generation', async () => {
      generate.mockResolvedValue({
        kind: 'failed',
        reason: 'no_valid_questions',
        model: 'claude-sonnet-5-5',
        cost: 0.014,
        latencyMs: 1800,
      });

      await service.start(PHYSICIAN_ID);
      await service.settle();

      expect(prisma.shiftReviewQuestion.createMany).not.toHaveBeenCalled();
      expect(prisma.shiftReview.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: expect.objectContaining({
          status: 'failed',
          failureReason: 'no_valid_questions',
          cost: 0.014,
        }),
      });
    });

    it('turns an unexpected error into a failed review, without throwing', async () => {
      prisma.aiInteraction.findMany.mockRejectedValue(new TypeError('boom'));

      await service.start(PHYSICIAN_ID);
      await service.settle();

      expect(prisma.shiftReview.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: { status: 'failed', failureReason: 'internal_error:TypeError' },
      });
    });

    it('is unavailable without any analysis this week', async () => {
      prisma.aiInteraction.findFirst.mockResolvedValue(null);

      expect(await service.start(PHYSICIAN_ID)).toEqual({ status: 'unavailable' });
      expect(prisma.shiftReview.create).not.toHaveBeenCalled();
    });
  });

  describe('answer', () => {
    beforeEach(() => {
      prisma.shiftReviewQuestion.findFirst.mockResolvedValue(questionRow());
    });

    it("looks up the question only among the physician's own", async () => {
      prisma.shiftReviewQuestion.findFirst.mockResolvedValue(null);

      await expect(
        service.answer(OTHER_PHYSICIAN_ID, QUESTION_ID, { chosenOption: 0, confidence: 'know' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.shiftReviewQuestion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: QUESTION_ID, physicianId: OTHER_PHYSICIAN_ID, review: { status: 'ready' } },
        }),
      );
      expect(prisma.shiftReviewQuestion.updateMany).not.toHaveBeenCalled();
    });

    it('scores the answer on the server and records the confidence', async () => {
      await service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 2, confidence: 'unsure' });

      expect(prisma.shiftReviewQuestion.updateMany).toHaveBeenCalledWith({
        where: { id: QUESTION_ID, answeredAt: null },
        data: { chosenOption: 2, confidence: 'unsure', correct: false, answeredAt: NOW },
      });
    });

    it('closes the review when the last question is answered', async () => {
      prisma.shiftReviewQuestion.count.mockResolvedValue(0);

      await service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 0, confidence: 'know' });

      expect(prisma.shiftReview.updateMany).toHaveBeenCalledWith({
        where: { id: REVIEW_ID, completedAt: null },
        data: { completedAt: NOW },
      });
    });

    it('refuses an option outside the list', async () => {
      await expect(
        service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 4, confidence: 'know' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts the same answer again (network retry) and refuses a different one', async () => {
      prisma.shiftReviewQuestion.findFirst.mockResolvedValue(
        questionRow({ chosenOption: 0, confidence: 'know', correct: true, answeredAt: NOW }),
      );

      await expect(
        service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 0, confidence: 'know' }),
      ).resolves.toMatchObject({ status: 'ready' });
      await expect(
        service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 1, confidence: 'know' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.shiftReviewQuestion.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a concurrent different answer that won the race', async () => {
      prisma.shiftReviewQuestion.updateMany.mockResolvedValue({ count: 0 });
      prisma.shiftReviewQuestion.findUnique.mockResolvedValue({
        chosenOption: 3,
        confidence: 'guessed',
      });

      await expect(
        service.answer(PHYSICIAN_ID, QUESTION_ID, { chosenOption: 0, confidence: 'know' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('generateWeekly', () => {
    it('generates the review of each physician with analyses, each with its own context', async () => {
      const contexts: unknown[] = [];
      generate.mockImplementation(async (material: ReviewMaterial) => {
        contexts.push(currentRequestContext()?.physicianId);
        return generatedFrom(material);
      });
      prisma.encounter.findMany.mockResolvedValue([
        { physicianId: PHYSICIAN_ID },
        { physicianId: OTHER_PHYSICIAN_ID },
      ]);

      const result = await service.generateWeekly(NOW);

      expect(result).toEqual({ generated: 2, failed: 0 });
      expect(contexts).toEqual([PHYSICIAN_ID, OTHER_PHYSICIAN_ID]);
      expect(prisma.shiftReview.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ trigger: 'weekly_job' }) }),
      );
      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            physician: { shiftReviews: { none: { periodStart: PERIOD_START } } },
          }),
          distinct: ['physicianId'],
        }),
      );
    });

    it('skips a physician whose review was created meanwhile', async () => {
      prisma.encounter.findMany.mockResolvedValue([{ physicianId: PHYSICIAN_ID }]);
      prisma.shiftReview.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      expect(await service.generateWeekly(NOW)).toEqual({ generated: 0, failed: 0 });
      expect(generate).not.toHaveBeenCalled();
    });
  });

  it('builds the material the generator receives from masked analyses', async () => {
    let received: ReviewMaterial | undefined;
    generate.mockImplementation(async (material: ReviewMaterial) => {
      received = material;
      return generatedFrom(material);
    });

    await service.start(PHYSICIAN_ID);
    await service.settle();

    expect(received?.analyses.map(({ key }) => key)).toEqual(
      buildReviewMaterial([headache, sepsis]).analyses.map(({ key }) => key),
    );
  });
});
