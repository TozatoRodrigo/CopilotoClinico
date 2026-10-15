import { Body, Controller, Get, HttpCode, Inject, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type {
  QuickQuestionAvailability,
  QuickQuestionResponse,
} from '../../shared/contracts/quick-question';
import { askQuickQuestionSchema, type AskQuickQuestionInput } from './quick-question.schemas';
import { QuickQuestionService } from './quick-question.service';

interface AuthenticatedRequest {
  user: { physicianId: string };
}

/**
 * CC-501 — pergunta rápida do Plantão. A pergunta vai no corpo, nunca na URL.
 */
@Controller('quick-questions')
@UseGuards(JwtAuthGuard)
export class QuickQuestionController {
  constructor(@Inject(QuickQuestionService) private readonly service: QuickQuestionService) {}

  /** A tela só mostra o campo com `COPILOT_QUICK_QUESTION` ligada. */
  @Get('availability')
  availability(): QuickQuestionAvailability {
    return this.service.availability();
  }

  /**
   * Consulta, não criação: 200. O teto por minuto é o de uma pessoa
   * perguntando (cada pergunta é uma chamada de embedding).
   */
  @Post()
  @HttpCode(200)
  @Throttle({ short: { limit: 30, ttl: 60000 } })
  ask(
    @Request() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(askQuickQuestionSchema)) body: AskQuickQuestionInput,
  ): Promise<QuickQuestionResponse> {
    return this.service.ask(req.user.physicianId, body);
  }
}
