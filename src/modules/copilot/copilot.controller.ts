import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  Sse,
  MessageEvent,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { analyzeSchema, streamQuerySchema, respondSchema } from './schemas/copilot.schemas';
import type { AnalyzeInput, StreamQuery, RespondInput } from './schemas/copilot.schemas';

@Controller('encounters/:encounterId/copilot')
@UseGuards(JwtAuthGuard)
export class CopilotController {
  constructor(@Inject(CopilotService) private readonly copilotService: CopilotService) {}

  @Post('analyze')
  async analyze(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(analyzeSchema)) body: AnalyzeInput,
  ) {
    return this.copilotService.analyze(req.user.physicianId, encounterId, body);
  }

  @Sse('stream')
  stream(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Query(new ZodValidationPipe(streamQuerySchema)) query: StreamQuery,
  ): Observable<MessageEvent> {
    const {
      caseText,
      hasCT,
      isSus,
      hasLab,
      hasICU,
      immunosuppressed,
      pregnant,
      anticoagulant,
      pediatric,
      elderly65,
      allergy,
    } = query;
    const input: AnalyzeInput = {
      caseText,
      context: { hasCT, isSus, hasLab, hasICU },
      // UX-06 — ver comentário em streamQuerySchema: paridade de red flags
      // com o caminho POST /analyze.
      redFlags: { immunosuppressed, pregnant, anticoagulant, pediatric, elderly65, allergy },
    };

    return new Observable((subscriber) => {
      const gen = this.copilotService.stream(req.user.physicianId, encounterId, input);

      void (async () => {
        try {
          for await (const event of gen) {
            subscriber.next({ data: event });
            if (event.type === 'done' || event.type === 'error') break;
          }
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }

  @Post('respond')
  async respond(
    @Request() req: { user: { physicianId: string } },
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(respondSchema)) body: RespondInput,
  ) {
    return this.copilotService.respond(req.user.physicianId, encounterId, body);
  }

  @Post('analyze/async')
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
