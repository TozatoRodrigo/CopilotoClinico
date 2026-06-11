import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Inject,
} from '@nestjs/common';
import { ProtocolStatus } from '@prisma/client';
import { ProtocolsService } from './protocols.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { createProtocolSchema, type CreateProtocolInput } from './schemas/protocol.schemas';

@Controller('protocols')
@UseGuards(JwtAuthGuard)
export class ProtocolsController {
  constructor(@Inject(ProtocolsService) private readonly protocolsService: ProtocolsService) {}

  @Post()
  async create(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(createProtocolSchema)) body: CreateProtocolInput,
  ) {
    return this.protocolsService.create(req.user.physicianId, body);
  }

  @Get()
  async findAll(@Query('specialty') specialty?: string, @Query('status') status?: ProtocolStatus) {
    return this.protocolsService.findAll({ specialty, status });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.protocolsService.findById(id);
  }

  @Post(':id/publish')
  async publish(@Request() req: { user: { physicianId: string } }, @Param('id') id: string) {
    return this.protocolsService.publish(req.user.physicianId, id);
  }

  @Post(':id/revise')
  async revise(
    @Request() req: { user: { physicianId: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createProtocolSchema)) body: CreateProtocolInput,
  ) {
    return this.protocolsService.reviseAsNewVersion(req.user.physicianId, id, body);
  }
}
