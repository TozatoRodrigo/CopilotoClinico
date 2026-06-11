import { Controller, Get, Post, Body, Param, UseGuards, Request, Inject } from '@nestjs/common';
import { ProtocolEngineService } from './protocol-engine.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  startProtocolRunSchema,
  answerProtocolRunSchema,
  abandonProtocolRunSchema,
  type StartProtocolRunInput,
  type AnswerProtocolRunInput,
  type AbandonProtocolRunInput,
} from './schemas/protocol-run.schemas';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProtocolEngineController {
  constructor(
    @Inject(ProtocolEngineService) private readonly protocolEngineService: ProtocolEngineService,
  ) {}

  @Post('encounters/:encounterId/protocol-runs')
  async start(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(startProtocolRunSchema)) body: StartProtocolRunInput,
  ) {
    return this.protocolEngineService.startRun(req.user.physicianId, encounterId, body.protocolId);
  }

  @Get('protocol-runs/:runId')
  async findOne(@Request() req: { user: { physicianId: string } }, @Param('runId') runId: string) {
    return this.protocolEngineService.getRun(req.user.physicianId, runId);
  }

  @Post('protocol-runs/:runId/answer')
  async answer(
    @Request() req: { user: { physicianId: string } },
    @Param('runId') runId: string,
    @Body(new ZodValidationPipe(answerProtocolRunSchema)) body: AnswerProtocolRunInput,
  ) {
    return this.protocolEngineService.answerNode(req.user.physicianId, runId, body.answer);
  }

  @Post('protocol-runs/:runId/abandon')
  async abandon(
    @Request() req: { user: { physicianId: string } },
    @Param('runId') runId: string,
    @Body(new ZodValidationPipe(abandonProtocolRunSchema)) body: AbandonProtocolRunInput,
  ) {
    return this.protocolEngineService.abandonRun(req.user.physicianId, runId, body.reason);
  }
}
