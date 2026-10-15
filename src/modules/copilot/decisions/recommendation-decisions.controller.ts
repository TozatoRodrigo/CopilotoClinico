import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  listRecommendationDecisionsQuerySchema,
  upsertRecommendationDecisionSchema,
} from '../schemas/copilot.schemas';
import type {
  ListRecommendationDecisionsQuery,
  UpsertRecommendationDecisionInput,
} from '../schemas/copilot.schemas';
import { RecommendationDecisionsService } from './recommendation-decisions.service';

/**
 * F0-D — Adotar / Rejeitar / Anotar por recomendação, persistidos no
 * servidor. Escopo pelo médico dono do encontro em todas as rotas — ver
 * RecommendationDecisionsService.
 */
@Controller('encounters/:encounterId/copilot/decisions')
@UseGuards(JwtAuthGuard)
export class RecommendationDecisionsController {
  constructor(
    @Inject(RecommendationDecisionsService)
    private readonly decisions: RecommendationDecisionsService,
  ) {}

  @Put()
  upsert(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @Body(new ZodValidationPipe(upsertRecommendationDecisionSchema))
    body: UpsertRecommendationDecisionInput,
  ) {
    return this.decisions.upsert(req.user.physicianId, encounterId, body);
  }

  @Get()
  list(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @Query(new ZodValidationPipe(listRecommendationDecisionsQuerySchema))
    query: ListRecommendationDecisionsQuery,
  ) {
    return this.decisions.list(req.user.physicianId, encounterId, query.interactionId);
  }
}
