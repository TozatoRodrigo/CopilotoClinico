import { Controller, Get, Post, Body, Param, UseGuards, Request, Inject } from '@nestjs/common';
import { InstitutionsService } from './institutions.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  createInstitutionSchema,
  linkPhysicianSchema,
  type CreateInstitutionInput,
  type LinkPhysicianInput,
} from './schemas/institutions.schemas';

@Controller('institutions')
export class InstitutionsController {
  constructor(
    @Inject(InstitutionsService) private readonly institutionsService: InstitutionsService,
  ) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async mine(@Request() req: { user: { physicianId: string } }) {
    return this.institutionsService.listForPhysician(req.user.physicianId);
  }

  @Post()
  @UseGuards(InternalServiceGuard)
  async create(@Body(new ZodValidationPipe(createInstitutionSchema)) body: CreateInstitutionInput) {
    return this.institutionsService.create(body);
  }

  @Get()
  @UseGuards(InternalServiceGuard)
  async findAll() {
    return this.institutionsService.findAll();
  }

  @Post(':id/physicians')
  @UseGuards(InternalServiceGuard)
  async linkPhysician(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkPhysicianSchema)) body: LinkPhysicianInput,
  ) {
    return this.institutionsService.linkPhysician(id, body.physicianId);
  }
}
