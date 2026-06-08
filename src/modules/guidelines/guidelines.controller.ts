import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { GuidelinesService } from './guidelines.service';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  ingestGuidelineSchema,
  deactivateGuidelineSchema,
  type IngestGuidelineBody,
  type DeactivateGuidelineBody,
} from './schemas/guidelines.schemas';

@Controller('guidelines')
export class GuidelinesController {
  constructor(@Inject(GuidelinesService) private readonly guidelinesService: GuidelinesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async listSources() {
    return this.guidelinesService.listSources();
  }

  @Get('chunks/:chunkId')
  @UseGuards(JwtAuthGuard)
  async getChunk(@Param('chunkId') chunkId: string) {
    const chunk = await this.guidelinesService.getChunkById(chunkId);
    if (!chunk) throw new NotFoundException('Guideline chunk not found');
    return chunk;
  }

  @Post()
  @UseGuards(InternalServiceGuard)
  async ingest(@Body(new ZodValidationPipe(ingestGuidelineSchema)) body: IngestGuidelineBody) {
    return this.guidelinesService.ingest(body);
  }

  @Patch('deactivate')
  @UseGuards(InternalServiceGuard)
  async deactivate(
    @Body(new ZodValidationPipe(deactivateGuidelineSchema)) body: DeactivateGuidelineBody,
  ) {
    return this.guidelinesService.deactivateSource(body.source, body.sourceVersion);
  }
}
