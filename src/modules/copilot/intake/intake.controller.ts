import {
  Body,
  Controller,
  Get,
  Inject,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { analyzeSchema, type AnalyzeInput } from '../schemas/copilot.schemas';
import { ConversationService } from './conversation.service';
import { IntakeService } from './intake.service';
import { answerIntakeSchema, type AnswerIntakeInput } from './intake.schemas';

type AuthenticatedRequest = { user: { physicianId: string } };

/**
 * ADR-014 — Copiloto guiado. O caso entra uma vez (POST intake); daí em
 * diante as rotas só levam o id da conversa — nenhum texto clínico na URL.
 */
@Controller('encounters/:encounterId/copilot')
@UseGuards(JwtAuthGuard)
export class IntakeController {
  constructor(
    @Inject(IntakeService) private readonly intake: IntakeService,
    @Inject(ConversationService) private readonly conversation: ConversationService,
  ) {}

  @Post('intake')
  start(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(analyzeSchema)) body: AnalyzeInput,
  ) {
    return this.intake.start(req.user.physicianId, encounterId, body);
  }

  @Post('intake/:intakeId/answers')
  answer(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
    @Body(new ZodValidationPipe(answerIntakeSchema)) body: AnswerIntakeInput,
  ) {
    return this.intake.answer(req.user.physicianId, encounterId, intakeId, body);
  }

  @Post('intake/:intakeId/skip')
  skip(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
  ) {
    return this.intake.skip(req.user.physicianId, encounterId, intakeId);
  }

  /** Plano sem streaming: o caminho de reserva quando o SSE cai. */
  @Post('intake/:intakeId/analyze')
  analyze(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
  ) {
    return this.conversation.analyze(req.user.physicianId, encounterId, intakeId);
  }

  @Sse('intake/:intakeId/stream')
  stream(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const events = this.conversation.stream(req.user.physicianId, encounterId, intakeId);
      // O plano segue até o fim mesmo se o médico fechar a aba: ele fica
      // gravado e aparece quando a conversa for reaberta.
      void (async () => {
        try {
          for await (const event of events) {
            subscriber.next({ data: event });
            if (event.type === 'done' || event.type === 'error') break;
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  @Get('conversation')
  getConversation(@Request() req: AuthenticatedRequest, @Param('encounterId') encounterId: string) {
    return this.conversation.get(req.user.physicianId, encounterId);
  }
}
