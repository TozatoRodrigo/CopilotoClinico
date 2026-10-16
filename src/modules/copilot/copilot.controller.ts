import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Inject,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CopilotService } from './copilot.service';
import { CopilotFeedbackService } from './feedback/copilot-feedback.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { analyzeSchema, respondSchema, copilotFeedbackSchema } from './schemas/copilot.schemas';
import type { AnalyzeInput, RespondInput, CopilotFeedbackInput } from './schemas/copilot.schemas';
import { sendEventStream, streamEvents } from './stream-events';
import { RequiresAiConsent } from '../lgpd/ai-consent.guard';

@Controller('encounters/:encounterId/copilot')
@UseGuards(JwtAuthGuard)
export class CopilotController {
  constructor(
    @Inject(CopilotService) private readonly copilotService: CopilotService,
    @Inject(CopilotFeedbackService) private readonly feedbackService: CopilotFeedbackService,
  ) {}

  @Post('analyze')
  @RequiresAiConsent()
  async analyze(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(analyzeSchema)) body: AnalyzeInput,
  ) {
    return this.copilotService.analyze(req.user.physicianId, encounterId, body);
  }

  @Post('respond')
  @RequiresAiConsent()
  async respond(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(respondSchema)) body: RespondInput,
  ) {
    return this.copilotService.respond(req.user.physicianId, encounterId, body);
  }

  /**
   * Reanálise por streaming — o mesmo corpo e a mesma validação do POST
   * /respond, com os eventos do streaming (entendimento refeito, deltas,
   * done) numa resposta text/event-stream. POST, e não GET com EventSource:
   * as respostas do médico vão no corpo, nunca na URL (ADR-014). O que recusa
   * o pedido (validação, interação de outro atendimento, teto de turnos,
   * injeção) sai antes de qualquer byte, como o 4xx de sempre.
   */
  @Post('respond/stream')
  @RequiresAiConsent()
  async respondStream(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(respondSchema)) body: RespondInput,
    @Res() reply: FastifyReply,
  ): Promise<FastifyReply> {
    const events = await this.copilotService.respondStream(req.user.physicianId, encounterId, body);
    return sendEventStream(
      reply,
      streamEvents(() => events),
    );
  }

  /**
   * F7 — "esta análise foi para o cenário errado".
   *
   * Fecha o ciclo que hoje passa por mensagem de WhatsApp: registra o
   * `interactionId`, os chunks recuperados, a cobertura do retrieval e os
   * chunks citados junto do comentário do médico, para que cada reporte já
   * nasça reproduzível — ver `tests/fixtures/field-incident-cases.ts`.
   *
   * F0-D — além da trilha de auditoria, o reporte entra na fila de triagem
   * da curadoria (console admin → Feedback).
   */
  @Post('feedback')
  async feedback(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(copilotFeedbackSchema)) body: CopilotFeedbackInput,
  ) {
    return this.feedbackService.submit(req.user.physicianId, encounterId, body);
  }

  @Post('analyze/async')
  @RequiresAiConsent()
  analyzeAsync(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(analyzeSchema)) body: AnalyzeInput,
  ) {
    return this.copilotService.analyzeAsync(req.user.physicianId, encounterId, body);
  }

  @Get('jobs/:jobId')
  getJobStatus(@Request() req: { user: { physicianId: string } }, @Param('jobId') jobId: string) {
    return this.copilotService.getJobStatus(req.user.physicianId, jobId);
  }

  @Get('latest')
  getLatest(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
  ) {
    return this.copilotService.getLatestInteraction(req.user.physicianId, encounterId);
  }
}
