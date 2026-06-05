import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { analyzeSchema } from './schemas/copilot.schemas';

@Controller('encounters/:encounterId/copilot')
@UseGuards(JwtAuthGuard)
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('analyze')
  async analyze(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(analyzeSchema)) body: unknown,
  ) {
    return this.copilotService.analyze(
      req.user.physicianId,
      encounterId,
      body as Parameters<typeof this.copilotService.analyze>[2],
    );
  }

  @Get('result')
  async result(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
  ) {
    return this.copilotService.findLatestResult(req.user.physicianId, encounterId);
  }
}
