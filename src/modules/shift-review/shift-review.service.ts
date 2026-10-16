import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type ShiftReviewTrigger } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../config/prisma.service';
import { runWithRequestContext } from '../../shared/request-context/request-context';
import type { ShiftReviewState } from '../../shared/contracts/shift-review';
import { SHIFT_REVIEW_CARD_SOURCE, type ShiftReviewCardSource } from './card-material';
import { buildReviewMaterial, latestValidAnalyses, type ReviewMaterial } from './review-material';
import { ReviewQuestionGenerator } from './review-question-generator.service';
import type { CheckedReviewQuestion } from './review-questions.schema';
import { reviewPeriodStart, reviewWindow } from './review-period';
import type { AnswerShiftReviewQuestionInput } from './schemas/shift-review.schemas';
import {
  MAX_GENERATION_ATTEMPTS,
  readShiftReviewEnabled,
  STALE_GENERATION_MS,
} from './shift-review.settings';
import { parseOptions, REVIEW_INCLUDE, reviewView, type ReviewRecord } from './shift-review.views';

/** Marca gravada pelo orquestrador na análise que falhou a validação. */
const OUTPUT_VALIDATION_FAILED = 'Output validation failed';

/**
 * Análise que saiu. `{ not }` sozinho descartaria as linhas com
 * `uncertainty_reason` NULL (NULL <> 'x' não é verdadeiro no SQL).
 */
const VALID_ANALYSIS: Prisma.AiInteractionWhereInput = {
  OR: [{ uncertaintyReason: null }, { uncertaintyReason: { not: OUTPUT_VALIDATION_FAILED } }],
};

/** Teto de linhas lidas por geração: várias rodadas por caso, no máximo 6 casos usados. */
const MAX_ANALYSIS_ROWS = 60;

/** Teto de médicos por rodada do job semanal. */
const WEEKLY_JOB_MAX_PHYSICIANS = 500;

const NO_MATERIAL = 'no_material';

interface ReviewWindow {
  start: Date;
  end: Date;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * CC-801 — "Revise seu plantão": até 3 perguntas por semana, geradas das
 * análises do próprio médico, respondidas com grau de certeza.
 *
 * Uma revisão por médico por semana (`shift_reviews`, único por médico e
 * segunda-feira). A geração é assíncrona: o médico abre a tela, a revisão
 * nasce em `generating` e a tela consulta até ficar pronta; o job semanal
 * (ShiftReviewCronService) adianta a de quem teve caso. Toda leitura e escrita
 * é escopada pelo médico do token: a pergunta de outro médico é 404.
 *
 * Logs só com ids, contagens, custo e tempo: nada da pergunta nem do caso.
 */
@Injectable()
export class ShiftReviewService {
  private readonly logger = new Logger(ShiftReviewService.name);
  /** Gerações em curso neste processo, para o teste e o desligamento esperarem. */
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ReviewQuestionGenerator) private readonly generator: ReviewQuestionGenerator,
    @Inject(SHIFT_REVIEW_CARD_SOURCE) private readonly cards: ShiftReviewCardSource,
  ) {}

  isEnabled(): boolean {
    return readShiftReviewEnabled(this.config);
  }

  async getCurrent(physicianId: string): Promise<ShiftReviewState> {
    if (!this.isEnabled()) return { status: 'disabled' };
    const now = new Date();
    const review = await this.findReview(physicianId, reviewPeriodStart(now));
    if (review) return this.stateOf(review, now);
    const hasAnalyses = await this.hasAnalysesSince(physicianId, reviewWindow(now).start);
    return { status: hasAnalyses ? 'available' : 'unavailable' };
  }

  /**
   * Abre a revisão da semana: devolve a que existe ou começa a geração.
   * Idempotente — dois toques (ou o job e o médico juntos) geram uma vez só.
   */
  async start(physicianId: string): Promise<ShiftReviewState> {
    if (!this.isEnabled()) return { status: 'disabled' };
    const now = new Date();
    const window = reviewWindow(now);
    const periodStart = reviewPeriodStart(now);

    const existing = await this.findReview(physicianId, periodStart);
    if (existing) {
      if (!(await this.canRegenerate(existing, now))) return this.stateOf(existing, now);
      // Concorrência otimista: só quem viu a linha neste estado a reivindica.
      const claimed = await this.prisma.shiftReview.updateMany({
        where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
        data: {
          status: 'generating',
          trigger: 'on_demand',
          attempts: { increment: 1 },
          failureReason: null,
          windowStart: window.start,
          windowEnd: window.end,
        },
      });
      if (claimed.count === 0) return this.getCurrent(physicianId);
      this.launch(existing.id, physicianId, window, 'on_demand');
      return { status: 'generating' };
    }

    if (!(await this.hasAnalysesSince(physicianId, window.start))) {
      return { status: 'unavailable' };
    }
    const reviewId = await this.createReview(physicianId, periodStart, window, 'on_demand');
    if (!reviewId) return this.getCurrent(physicianId);
    this.launch(reviewId, physicianId, window, 'on_demand');
    return { status: 'generating' };
  }

  async answer(
    physicianId: string,
    questionId: string,
    input: AnswerShiftReviewQuestionInput,
  ): Promise<ShiftReviewState> {
    if (!this.isEnabled()) throw new NotFoundException('Question not found');
    const question = await this.prisma.shiftReviewQuestion.findFirst({
      where: { id: questionId, physicianId, review: { status: 'ready' } },
      select: {
        id: true,
        reviewId: true,
        position: true,
        options: true,
        correctOption: true,
        chosenOption: true,
        confidence: true,
        answeredAt: true,
      },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (input.chosenOption >= parseOptions(question.options).length) {
      throw new BadRequestException('chosenOption is not one of the options');
    }

    const sameAnswer = (answer: { chosenOption: number | null; confidence: string | null }) =>
      answer.chosenOption === input.chosenOption && answer.confidence === input.confidence;
    if (question.answeredAt) {
      // Reenvio idêntico (retry de rede) não é conflito; trocar a resposta é.
      if (sameAnswer(question)) return this.reviewState(question.reviewId);
      throw new ConflictException('Question already answered');
    }

    const now = new Date();
    const correct = input.chosenOption === question.correctOption;
    const updated = await this.prisma.shiftReviewQuestion.updateMany({
      where: { id: question.id, answeredAt: null },
      data: {
        chosenOption: input.chosenOption,
        confidence: input.confidence,
        correct,
        answeredAt: now,
      },
    });
    if (updated.count === 0) {
      const current = await this.prisma.shiftReviewQuestion.findUnique({
        where: { id: question.id },
        select: { chosenOption: true, confidence: true },
      });
      if (!current || !sameAnswer(current)) {
        throw new ConflictException('Question already answered');
      }
      return this.reviewState(question.reviewId);
    }

    const remaining = await this.prisma.shiftReviewQuestion.count({
      where: { reviewId: question.reviewId, answeredAt: null },
    });
    if (remaining === 0) {
      await this.prisma.shiftReview.updateMany({
        where: { id: question.reviewId, completedAt: null },
        data: { completedAt: now },
      });
    }
    this.logger.log(
      `SHIFT_REVIEW_ANSWERED review=${question.reviewId} position=${question.position} ` +
        `confidence=${input.confidence} correct=${correct} remaining=${remaining}`,
    );
    return this.reviewState(question.reviewId);
  }

  /**
   * Job semanal: gera a revisão de quem teve análise nos últimos 7 dias e
   * ainda não tem a da semana. Um médico por vez, cada um com o seu
   * requestId (o rastro em `ai_calls` sai com o médico certo).
   */
  async generateWeekly(now = new Date()): Promise<{ generated: number; failed: number }> {
    if (!this.isEnabled()) return { generated: 0, failed: 0 };
    const window = reviewWindow(now);
    const periodStart = reviewPeriodStart(now);
    const physicians = await this.prisma.encounter.findMany({
      where: {
        status: { not: 'cancelled' },
        aiInteractions: { some: { createdAt: { gte: window.start }, ...VALID_ANALYSIS } },
        physician: { shiftReviews: { none: { periodStart } } },
      },
      distinct: ['physicianId'],
      select: { physicianId: true },
      take: WEEKLY_JOB_MAX_PHYSICIANS,
    });

    let generated = 0;
    let failed = 0;
    for (const { physicianId } of physicians) {
      const reviewId = await this.createReview(physicianId, periodStart, window, 'weekly_job');
      if (!reviewId) continue;
      const ready = await runWithRequestContext(
        { requestId: randomUUID(), physicianId, encounterId: null },
        () => this.generate(reviewId, physicianId, window, 'weekly_job'),
      );
      if (ready) generated += 1;
      else failed += 1;
    }
    return { generated, failed };
  }

  /** Espera as gerações em curso neste processo (teste e desligamento). */
  async settle(): Promise<void> {
    await Promise.all([...this.inFlight]);
  }

  private async createReview(
    physicianId: string,
    periodStart: Date,
    window: ReviewWindow,
    trigger: ShiftReviewTrigger,
  ): Promise<string | null> {
    try {
      const review = await this.prisma.shiftReview.create({
        data: {
          physicianId,
          periodStart,
          status: 'generating',
          trigger,
          windowStart: window.start,
          windowEnd: window.end,
        },
        select: { id: true },
      });
      return review.id;
    } catch (error) {
      // O job e o médico (ou dois toques) chegaram juntos: vale a outra linha.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /** Fora do caminho da requisição: a tela consulta até a revisão ficar pronta. */
  private launch(
    reviewId: string,
    physicianId: string,
    window: ReviewWindow,
    trigger: ShiftReviewTrigger,
  ): void {
    const run = this.generate(reviewId, physicianId, window, trigger)
      .then(() => undefined)
      .finally(() => this.inFlight.delete(run));
    this.inFlight.add(run);
  }

  /** Gera e grava; nunca lança. `true` quando a revisão ficou pronta. */
  private async generate(
    reviewId: string,
    physicianId: string,
    window: ReviewWindow,
    trigger: ShiftReviewTrigger,
  ): Promise<boolean> {
    try {
      const material = await this.loadMaterial(physicianId, window);
      if (material.analyses.length === 0) {
        await this.markFailed(reviewId, NO_MATERIAL, { analysisCount: 0 });
        return false;
      }

      const outcome = await this.generator.generate(material);
      const usage = { model: outcome.model, cost: outcome.cost, latencyMs: outcome.latencyMs };
      if (outcome.kind === 'failed') {
        await this.markFailed(reviewId, outcome.reason, {
          analysisCount: material.analyses.length,
          ...usage,
        });
        return false;
      }

      await this.prisma.$transaction([
        this.prisma.shiftReviewQuestion.createMany({
          data: outcome.questions.map((question, position) =>
            this.questionRecord(reviewId, physicianId, position, question),
          ),
        }),
        this.prisma.shiftReview.update({
          where: { id: reviewId },
          data: {
            status: 'ready',
            analysisCount: material.analyses.length,
            generatedAt: new Date(),
            failureReason: null,
            ...usage,
          },
        }),
      ]);
      this.logger.log(
        `SHIFT_REVIEW_READY review=${reviewId} trigger=${trigger} questions=${outcome.questions.length} ` +
          `analyses=${material.analyses.length} sources=${material.sources.size} ` +
          `model=${outcome.model ?? '-'} costUsd=${outcome.cost} latencyMs=${outcome.latencyMs}`,
      );
      return true;
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      this.logger.error(`SHIFT_REVIEW_GENERATION_ERROR review=${reviewId} error=${name}`);
      // Só a classe do erro: a mensagem pode carregar dado da consulta.
      if (process.env.SENTRY_DSN) {
        Sentry.captureMessage('SHIFT_REVIEW_GENERATION_ERROR', {
          level: 'error',
          tags: { component: 'shift-review', trigger },
          extra: { reviewId, errorName: name },
        });
      }
      await this.markFailed(reviewId, `internal_error:${name}`.slice(0, 64), {}).catch(() => {
        // a linha fica em `generating` e vence por tempo (STALE_GENERATION_MS)
      });
      return false;
    }
  }

  private async markFailed(
    reviewId: string,
    reason: string,
    data: Partial<{ analysisCount: number; model: string | null; cost: number; latencyMs: number }>,
  ): Promise<void> {
    await this.prisma.shiftReview.update({
      where: { id: reviewId },
      data: { status: 'failed', failureReason: reason, ...data },
    });
    this.logger.warn(`SHIFT_REVIEW_FAILED review=${reviewId} reason=${reason}`);
  }

  private questionRecord(
    reviewId: string,
    physicianId: string,
    position: number,
    { draft, source }: CheckedReviewQuestion,
  ): Prisma.ShiftReviewQuestionCreateManyInput {
    return {
      reviewId,
      physicianId,
      encounterId: source.encounterId,
      interactionId: source.interactionId,
      position,
      format: draft.format,
      stem: draft.stem,
      options: draft.options,
      correctOption: draft.correctOption,
      explanation: draft.explanation,
      topic: draft.topic,
      syndrome: source.syndrome,
      source: source.stored,
      cardId: source.stored.kind === 'knowledge_card' ? source.stored.cardId : null,
    };
  }

  /** Só análises do próprio médico, na janela, de casos não cancelados. */
  private async loadMaterial(physicianId: string, window: ReviewWindow): Promise<ReviewMaterial> {
    const interactions = await this.prisma.aiInteraction.findMany({
      where: {
        createdAt: { gte: window.start, lte: window.end },
        encounter: { physicianId, status: { not: 'cancelled' } },
        ...VALID_ANALYSIS,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ANALYSIS_ROWS,
      select: {
        id: true,
        encounterId: true,
        rawOutput: true,
        createdAt: true,
        encounter: { select: { patientRef: true } },
      },
    });
    const rows = interactions.map((interaction) => ({
      interactionId: interaction.id,
      encounterId: interaction.encounterId,
      patientRef: interaction.encounter.patientRef,
      createdAt: interaction.createdAt,
      rawOutput: interaction.rawOutput,
    }));
    const cards = await this.cards.cardsUsedBy(
      latestValidAnalyses(rows).map(({ row }) => row.interactionId),
    );
    return buildReviewMaterial(rows, cards);
  }

  private async hasAnalysesSince(physicianId: string, since: Date): Promise<boolean> {
    const analysis = await this.prisma.aiInteraction.findFirst({
      where: {
        createdAt: { gt: since },
        encounter: { physicianId, status: { not: 'cancelled' } },
        ...VALID_ANALYSIS,
      },
      select: { id: true },
    });
    return analysis !== null;
  }

  private findReview(physicianId: string, periodStart: Date): Promise<ReviewRecord | null> {
    return this.prisma.shiftReview.findUnique({
      where: { physicianId_periodStart: { physicianId, periodStart } },
      include: REVIEW_INCLUDE,
    });
  }

  private isStale(review: ReviewRecord, now: Date): boolean {
    return now.getTime() - review.updatedAt.getTime() > STALE_GENERATION_MS;
  }

  /**
   * Pode gerar de novo: falhou (ou parou com o processo) e ainda há
   * tentativa. Sem material, só quando chegou análise nova depois dela.
   */
  private async canRegenerate(review: ReviewRecord, now: Date): Promise<boolean> {
    if (review.status === 'ready') return false;
    if (review.status === 'generating' && !this.isStale(review, now)) return false;
    if (review.attempts >= MAX_GENERATION_ATTEMPTS) return false;
    if (review.failureReason === NO_MATERIAL) {
      return this.hasAnalysesSince(review.physicianId, review.updatedAt);
    }
    return true;
  }

  private async stateOf(review: ReviewRecord, now: Date): Promise<ShiftReviewState> {
    if (review.status === 'ready') {
      // Perguntas somem com o caso apagado (LGPD): sem nenhuma, não há revisão.
      if (review.questions.length === 0) return { status: 'unavailable' };
      const view = reviewView(review);
      const done = view.questions.every((question) => question.answer !== null);
      return done ? { status: 'completed', review: view } : { status: 'ready', review: view };
    }
    if (review.status === 'generating' && !this.isStale(review, now)) {
      return { status: 'generating' };
    }
    return (await this.canRegenerate(review, now))
      ? { status: 'available' }
      : { status: 'unavailable' };
  }

  private async reviewState(reviewId: string): Promise<ShiftReviewState> {
    const review = await this.prisma.shiftReview.findUniqueOrThrow({
      where: { id: reviewId },
      include: REVIEW_INCLUDE,
    });
    return this.stateOf(review, new Date());
  }
}
