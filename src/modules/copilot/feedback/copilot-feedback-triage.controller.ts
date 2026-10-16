import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { EvalCaseDraft } from '../../../shared/contracts/clinical';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { CuratorGuard } from '../../../shared/guards/curator.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  listCopilotFeedbackQuerySchema,
  updateCopilotFeedbackTriageSchema,
} from '../schemas/copilot.schemas';
import type {
  ListCopilotFeedbackQuery,
  UpdateCopilotFeedbackTriageInput,
} from '../schemas/copilot.schemas';
import { CopilotFeedbackService } from './copilot-feedback.service';

/**
 * F0-D — fila de triagem do feedback dos médicos, no console admin.
 *
 * Mesma barreira da curadoria de diretrizes (KB-002): papel COMPLIANCE/ADMIN
 * e flag `isCurator`. Triar exige julgamento clínico, e a resposta traz o
 * texto do caso (mascarado) de atendimentos de outros médicos.
 */
@Controller('admin/copilot-feedback')
@UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
@Roles('COMPLIANCE', 'ADMIN')
export class CopilotFeedbackTriageController {
  constructor(@Inject(CopilotFeedbackService) private readonly feedback: CopilotFeedbackService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listCopilotFeedbackQuerySchema)) query: ListCopilotFeedbackQuery,
  ) {
    return this.feedback.listForTriage(query);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { physicianId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCopilotFeedbackTriageSchema))
    body: UpdateCopilotFeedbackTriageInput,
  ) {
    return this.feedback.updateTriage(req.user.physicianId, id, body);
  }

  /**
   * CC-703 — rascunho do caso do gabarito (formato v2, já válido no schema),
   * como download `<id>.json`: o curador salva em evals/clinical/cases/,
   * preenche o que está marcado e abre o PR.
   */
  @Get(':id/eval-case-draft')
  @Header('Cache-Control', 'no-store')
  async evalCaseDraft(
    @Request() req: { user: { physicianId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<EvalCaseDraft> {
    const draft = await this.feedback.exportEvalCaseDraft(req.user.physicianId, id);
    reply.header('Content-Disposition', `attachment; filename="${draft.id}.json"`);
    return draft;
  }
}
