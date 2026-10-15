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
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { CuratorGuard } from '../../shared/guards/curator.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type {
  DraftFromKnowledgeGapResponse,
  KnowledgeGapQueueItem,
  KnowledgeGapQueuePage,
  KnowledgeGapWeeklyReport,
} from '../../shared/contracts/knowledge-gaps';
import { KnowledgeGapQueueService } from './knowledge-gap-queue.service';
import {
  dismissKnowledgeGapSchema,
  draftFromKnowledgeGapSchema,
  knowledgeGapQueueQuerySchema,
  weeklyReportQuerySchema,
  type DismissKnowledgeGapInput,
  type DraftFromKnowledgeGapInput,
  type KnowledgeGapQueueQueryInput,
  type WeeklyReportQueryInput,
} from './knowledge-gap.schemas';

interface AuthenticatedRequest {
  user: { physicianId: string };
}

/**
 * CC-409 — fila de criação de cartões no console admin. Mesma barreira da
 * triagem do feedback e dos cartões: papel COMPLIANCE/ADMIN e `isCurator`.
 */
@Controller('admin/knowledge-gaps')
@UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
@Roles('COMPLIANCE', 'ADMIN')
export class KnowledgeGapQueueController {
  constructor(@Inject(KnowledgeGapQueueService) private readonly queue: KnowledgeGapQueueService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(knowledgeGapQueueQuerySchema)) query: KnowledgeGapQueueQueryInput,
  ): Promise<KnowledgeGapQueuePage> {
    return this.queue.list(query);
  }

  // Antes de `:id`: "weekly-report" não é um id de grupo.
  @Get('weekly-report')
  weeklyReport(
    @Query(new ZodValidationPipe(weeklyReportQuerySchema)) query: WeeklyReportQueryInput,
  ): Promise<KnowledgeGapWeeklyReport> {
    return this.queue.weeklyReport(query.endingAt);
  }

  /** "Gerar rascunho de cartão" (CC-403, `KNOWLEDGE_CARDS_DRAFT_ENABLED`). */
  @Post(':id/draft')
  @HttpCode(200)
  draft(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(draftFromKnowledgeGapSchema)) body: DraftFromKnowledgeGapInput,
  ): Promise<DraftFromKnowledgeGapResponse> {
    return this.queue.draft(req.user.physicianId, id, body);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(dismissKnowledgeGapSchema)) body: DismissKnowledgeGapInput,
  ): Promise<KnowledgeGapQueueItem> {
    return this.queue.dismiss(req.user.physicianId, id, body);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KnowledgeGapQueueItem> {
    return this.queue.reopen(req.user.physicianId, id);
  }
}
