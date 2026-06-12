import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Inject,
} from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  createEncounterSchema,
  updateEncounterSchema,
  listEncountersQuerySchema,
} from './schemas/encounter.schemas';
import type {
  CreateEncounterInput,
  UpdateEncounterInput,
  ListEncountersQuery,
} from './schemas/encounter.schemas';

@Controller('encounters')
@UseGuards(JwtAuthGuard)
export class EncountersController {
  constructor(@Inject(EncountersService) private readonly encountersService: EncountersService) {}

  @Post()
  async create(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(createEncounterSchema)) body: CreateEncounterInput,
  ) {
    return this.encountersService.create(req.user.physicianId, body);
  }

  @Get('stats')
  async stats(@Request() req: { user: { physicianId: string } }) {
    return this.encountersService.getDashboardStats(req.user.physicianId);
  }

  @Get()
  async findAll(
    @Request() req: { user: { physicianId: string } },
    @Query(new ZodValidationPipe(listEncountersQuerySchema)) query: ListEncountersQuery,
  ) {
    return this.encountersService.findByPhysician(req.user.physicianId, query);
  }

  @Get(':id')
  async findOne(@Request() req: { user: { physicianId: string } }, @Param('id') id: string) {
    return this.encountersService.findById(req.user.physicianId, id);
  }

  @Patch(':id')
  async update(
    @Request() req: { user: { physicianId: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEncounterSchema)) body: UpdateEncounterInput,
  ) {
    return this.encountersService.update(req.user.physicianId, id, body);
  }
}
