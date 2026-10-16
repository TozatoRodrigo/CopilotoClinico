import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import type { KnowledgeGapReportResponse } from '../../../shared/contracts/clinical';
import { knowledgeGapReportSchema, type KnowledgeGapReportInput } from '../schemas/copilot.schemas';
import { KnowledgeGapService } from './knowledge-gap.service';

/**
 * CC-703 — "não encontrei o que precisava", tocado pelo médico na análise.
 * Qualquer médico autenticado, só nas análises dos próprios atendimentos.
 */
@Controller('encounters/:encounterId/copilot/knowledge-gaps')
@UseGuards(JwtAuthGuard)
export class KnowledgeGapController {
  constructor(@Inject(KnowledgeGapService) private readonly gaps: KnowledgeGapService) {}

  @Post()
  report(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @Body(new ZodValidationPipe(knowledgeGapReportSchema)) body: KnowledgeGapReportInput,
  ): Promise<KnowledgeGapReportResponse> {
    return this.gaps.reportNotFound(req.user.physicianId, encounterId, body);
  }
}
