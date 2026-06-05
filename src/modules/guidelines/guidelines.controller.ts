import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { GuidelinesService } from './guidelines.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('citations')
@UseGuards(JwtAuthGuard)
export class GuidelinesController {
  constructor(private readonly guidelines: GuidelinesService) {}

  @Get(':chunkId')
  async findCitation(@Param('chunkId') chunkId: string) {
    const chunk = await this.guidelines.getChunkById(chunkId);
    if (!chunk) {
      throw new NotFoundException('Citation not found');
    }
    return chunk;
  }
}
