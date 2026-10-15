import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
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
}
