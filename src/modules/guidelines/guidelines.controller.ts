import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { GuidelinesService } from './guidelines.service';

@Controller('guidelines')
@UseGuards(JwtAuthGuard)
export class GuidelinesController {
  constructor(private readonly guidelinesService: GuidelinesService) {}

  @Get('chunks/:chunkId')
  async getChunk(@Param('chunkId') chunkId: string) {
    const chunk = await this.guidelinesService.getChunkById(chunkId);

    if (!chunk) {
      throw new NotFoundException('Guideline chunk not found');
    }

    return chunk;
  }
}
