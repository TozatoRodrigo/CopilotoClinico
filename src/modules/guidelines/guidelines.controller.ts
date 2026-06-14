import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { CuratorGuard } from '../../shared/guards/curator.guard';
import { GuidelinesService } from './guidelines.service';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  ingestGuidelineSchema,
  deactivateGuidelineSchema,
  rejectGuidelineChunkSchema,
  type IngestGuidelineBody,
  type DeactivateGuidelineBody,
  type RejectGuidelineChunkBody,
} from './schemas/guidelines.schemas';

@Controller('guidelines')
export class GuidelinesController {
  constructor(@Inject(GuidelinesService) private readonly guidelinesService: GuidelinesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async listSources() {
    return this.guidelinesService.listSources();
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async listPending() {
    return this.guidelinesService.listPending();
  }

  @Get('chunks/:chunkId')
  @UseGuards(JwtAuthGuard)
  async getChunk(@Param('chunkId') chunkId: string) {
    const chunk = await this.guidelinesService.getChunkById(chunkId);
    if (!chunk) throw new NotFoundException('Guideline chunk not found');
    return chunk;
  }

  @Post('chunks/:chunkId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async approveChunk(
    @Request() req: { user: { physicianId: string } },
    @Param('chunkId') chunkId: string,
  ) {
    return this.guidelinesService.approveChunk(chunkId, req.user.physicianId);
  }

  @Post('chunks/:chunkId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async rejectChunk(
    @Request() req: { user: { physicianId: string } },
    @Param('chunkId') chunkId: string,
    @Body(new ZodValidationPipe(rejectGuidelineChunkSchema)) body: RejectGuidelineChunkBody,
  ) {
    return this.guidelinesService.rejectChunk(chunkId, req.user.physicianId, body.reason);
  }

  @Post()
  @UseGuards(InternalServiceGuard)
  async ingest(@Body(new ZodValidationPipe(ingestGuidelineSchema)) body: IngestGuidelineBody) {
    return this.guidelinesService.ingest(body);
  }

  @Post('ingest-review')
  @UseGuards(JwtAuthGuard, RolesGuard, CuratorGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async ingestForReview(
    @Body(new ZodValidationPipe(ingestGuidelineSchema)) body: IngestGuidelineBody,
  ) {
    return this.guidelinesService.ingestForReview(body);
  }

  @Patch('deactivate')
  @UseGuards(InternalServiceGuard)
  async deactivate(
    @Body(new ZodValidationPipe(deactivateGuidelineSchema)) body: DeactivateGuidelineBody,
  ) {
    return this.guidelinesService.deactivateSource(body.source, body.sourceVersion);
  }
}
