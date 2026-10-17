import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import type { ShiftReviewMapState, ShiftReviewState } from '../../shared/contracts/shift-review';
import { CalibrationMapService } from './calibration-map.service';
import {
  answerShiftReviewQuestionSchema,
  type AnswerShiftReviewQuestionInput,
} from './schemas/shift-review.schemas';
import { ShiftReviewService } from './shift-review.service';

/**
 * CC-801 — "Revise seu plantão" e CC-802 — "Seu mapa". O médico vem sempre do
 * token: não há rota que receba o id de outro médico.
 */
@Controller('shift-review')
@UseGuards(JwtAuthGuard)
export class ShiftReviewController {
  constructor(
    @Inject(ShiftReviewService) private readonly reviews: ShiftReviewService,
    @Inject(CalibrationMapService) private readonly maps: CalibrationMapService,
  ) {}

  /** Estado da revisão da semana; o Plantão mostra a entrada a partir dele. */
  @Get('current')
  current(@Request() req: { user: { physicianId: string } }): Promise<ShiftReviewState> {
    return this.reviews.getCurrent(req.user.physicianId);
  }

  /** Abre a revisão: devolve a da semana ou começa a gerar (idempotente). */
  @Post('current')
  @HttpCode(200)
  start(@Request() req: { user: { physicianId: string } }): Promise<ShiftReviewState> {
    return this.reviews.start(req.user.physicianId);
  }

  @Post('questions/:questionId/answer')
  @HttpCode(200)
  answer(
    @Request() req: { user: { physicianId: string } },
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body(new ZodValidationPipe(answerShiftReviewQuestionSchema))
    body: AnswerShiftReviewQuestionInput,
  ): Promise<ShiftReviewState> {
    return this.reviews.answer(req.user.physicianId, questionId, body);
  }

  /** CC-802 — mapa de calibração por tema, só com as respostas do próprio médico. */
  @Get('map')
  map(@Request() req: { user: { physicianId: string } }): Promise<ShiftReviewMapState> {
    return this.maps.getMap(req.user.physicianId);
  }
}
