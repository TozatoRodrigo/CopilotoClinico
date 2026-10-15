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
  KnowledgeCardReviewItem,
  KnowledgeCardReviewQueue,
} from '../../../shared/contracts/knowledge-card-review';
import {
  createKnowledgeCardVersionSchema,
  type CreateKnowledgeCardVersionInput,
} from '../schemas/knowledge-cards.schemas';
import {
  reviewApproveSchema,
  reviewQueueQuerySchema,
  reviewRejectSchema,
  type ReviewApproveInput,
  type ReviewQueueQueryInput,
  type ReviewRejectInput,
} from './card-review.schemas';
import { CardReviewService } from './card-review.service';

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
 */
@Controller('review/knowledge-cards')
@UseGuards(JwtAuthGuard, CardReviewerGuard)
export class CardReviewController {
  constructor(@Inject(CardReviewService) private readonly review: CardReviewService) {}

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
  ): Promise<KnowledgeCardReviewItem> {
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
}
