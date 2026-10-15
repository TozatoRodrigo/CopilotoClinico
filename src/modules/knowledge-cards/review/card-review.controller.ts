import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { CardReviewerGuard } from '../../../shared/guards/card-reviewer.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import type { KnowledgeCardDetail } from '../../../shared/contracts/knowledge-cards';
import type {
  KnowledgeCardCrossReviewSummary,
  KnowledgeCardReviewQueue,
  KnowledgeCardReviewTaskItem,
} from '../../../shared/contracts/knowledge-card-review';
import {
  createKnowledgeCardVersionSchema,
  type CreateKnowledgeCardVersionInput,
} from '../schemas/knowledge-cards.schemas';
import {
  agreeCrossReviewSchema,
  divergeCrossReviewSchema,
  reviewApproveSchema,
  reviewQueueQuerySchema,
  reviewRejectSchema,
  type AgreeCrossReviewInput,
  type DivergeCrossReviewInput,
  type ReviewApproveInput,
  type ReviewQueueQueryInput,
  type ReviewRejectInput,
} from './card-review.schemas';
import { CardReviewService } from './card-review.service';
import { CrossReviewService } from './cross-review.service';

interface AuthenticatedRequest {
  user: { physicianId: string };
}

/**
 * CC-404 (ADR-019, adendo) — fila de revisão de cartões no celular.
 *
 * Barreira própria, separada do console admin: a flag `is_card_reviewer` e
 * CRM verificado (`CardReviewerGuard`), sem papel COMPLIANCE/ADMIN. O revisor
 * só vê a fila, decide um cartão por vez e não pede rascunho à IA nem
 * arquiva cartão publicado — isso continua em `admin/knowledge-cards`.
 *
 * CC-411 — a revisão cruzada (concordar/divergir) e o painel da taxa de
 * concordância ficam na mesma barreira: quem revê é revisor.
 */
@Controller('review/knowledge-cards')
@UseGuards(JwtAuthGuard, CardReviewerGuard)
export class CardReviewController {
  constructor(
    @Inject(CardReviewService) private readonly review: CardReviewService,
    @Inject(CrossReviewService) private readonly crossReview: CrossReviewService,
  ) {}

  @Get('next')
  next(
    @Request() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(reviewQueueQuerySchema)) query: ReviewQueueQueryInput,
  ): Promise<KnowledgeCardReviewQueue> {
    return this.review.next(req.user.physicianId, query);
  }

  @Post(':id/versions')
  correct(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createKnowledgeCardVersionSchema))
    body: CreateKnowledgeCardVersionInput,
  ): Promise<KnowledgeCardReviewTaskItem> {
    return this.review.correct(req.user.physicianId, id, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewApproveSchema)) body: ReviewApproveInput,
  ): Promise<KnowledgeCardDetail> {
    return this.review.approve(req.user.physicianId, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewRejectSchema)) body: ReviewRejectInput,
  ): Promise<KnowledgeCardDetail> {
    return this.review.reject(req.user.physicianId, id, body);
  }

  /** CC-411 — painel: concordância, divergência, pendentes e o tempo de revisão. */
  @Get('cross-reviews/summary')
  crossReviewSummary(
    @Request() req: AuthenticatedRequest,
  ): Promise<KnowledgeCardCrossReviewSummary> {
    return this.crossReview.summary(req.user.physicianId);
  }

  @Post('cross-reviews/:id/agree')
  @HttpCode(200)
  agree(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(agreeCrossReviewSchema)) body: AgreeCrossReviewInput,
  ): Promise<KnowledgeCardDetail> {
    return this.crossReview.agree(req.user.physicianId, id, body);
  }

  /** Divergir é corrigir: o cartão sai do ar e volta para a fila com a correção. */
  @Post('cross-reviews/:id/diverge')
  @HttpCode(200)
  diverge(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(divergeCrossReviewSchema)) body: DivergeCrossReviewInput,
  ): Promise<KnowledgeCardDetail> {
    return this.crossReview.diverge(req.user.physicianId, id, body);
  }
}
