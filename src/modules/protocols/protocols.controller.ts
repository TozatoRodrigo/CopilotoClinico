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
  ForbiddenException,
} from '@nestjs/common';
import { ProtocolStatus } from '@prisma/client';
import { ProtocolsService } from './protocols.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { createProtocolSchema, type CreateProtocolInput } from './schemas/protocol.schemas';

@Controller('protocols')
@UseGuards(JwtAuthGuard)
export class ProtocolsController {
  constructor(
    @Inject(ProtocolsService) private readonly protocolsService: ProtocolsService,
    @Inject(InstitutionsService) private readonly institutionsService: InstitutionsService,
  ) {}

  @Post()
  async create(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(createProtocolSchema)) body: CreateProtocolInput,
  ) {
    return this.protocolsService.create(req.user.physicianId, body);
  }

  @Get()
  async findAll(
    @Request() req: { user: { physicianId: string } },
    @Query('specialty') specialty?: string,
    @Query('status') status?: ProtocolStatus,
    @Query('institutionId') institutionId?: string,
  ) {
    const resolvedInstitutionId = await this.resolveInstitutionId(
      req.user.physicianId,
      institutionId,
    );
    return this.protocolsService.findAll({
      specialty,
      status,
      institutionId: resolvedInstitutionId,
    });
  }

  @Get(':id')
  async findOne(
    @Request() req: { user: { physicianId: string } },
    @Param('id') id: string,
    @Query('institutionId') institutionId?: string,
  ) {
    const resolvedInstitutionId = await this.resolveInstitutionId(
      req.user.physicianId,
      institutionId,
    );
    return this.protocolsService.findById(id, resolvedInstitutionId);
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

  /**
   * PROT-004: resolve a instituição usada para filtrar/isolar protocolos.
   * - Se informada explicitamente, o médico precisa pertencer a ela.
   * - Caso contrário, usa a instituição única do médico (default), ou
   *   permanece global (null) se ele não tiver vínculo ou tiver mais de um.
   */
  private async resolveInstitutionId(
    physicianId: string,
    requestedInstitutionId?: string,
  ): Promise<string | null> {
    const institutions = await this.institutionsService.listForPhysician(physicianId);

    if (requestedInstitutionId) {
      const belongs = institutions.some((i) => i.id === requestedInstitutionId);
      if (!belongs) {
        throw new ForbiddenException('Médico não pertence à instituição informada');
      }
      return requestedInstitutionId;
    }

    return institutions.length === 1 ? institutions[0]!.id : null;
  }
}
