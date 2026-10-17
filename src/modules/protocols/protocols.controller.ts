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

/**
 * Ler e rodar protocolo é de todo médico (com o filtro de instituição do
 * CC-019). Criar, publicar e revisar exige curador ou ADMIN (CC-020),
 * conferido em `ProtocolsService` para valer em qualquer chamador.
 */
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
    await this.assertMember(req.user.physicianId, body.institutionId);
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
    const institutionIds = await this.institutionsService.activeInstitutionIds(
      req.user.physicianId,
    );
    return this.protocolsService.publish(req.user.physicianId, id, institutionIds);
  }

  @Post(':id/revise')
  async revise(
    @Request() req: { user: { physicianId: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createProtocolSchema)) body: CreateProtocolInput,
  ) {
    await this.assertMember(req.user.physicianId, body.institutionId);
    const institutionIds = await this.institutionsService.activeInstitutionIds(
      req.user.physicianId,
    );
    return this.protocolsService.reviseAsNewVersion(req.user.physicianId, id, body, institutionIds);
  }

  /**
   * PROT-004: resolve a instituição usada para filtrar/isolar protocolos.
   * - Se informada explicitamente, o médico precisa pertencer a ela.
   * - Caso contrário, usa a instituição única do médico (default), ou
   *   permanece global (null) se ele não tiver vínculo ou tiver mais de um.
   * CC-019 — só vínculos ativos contam (ver institution-visibility.ts).
   */
  private async resolveInstitutionId(
    physicianId: string,
    requestedInstitutionId?: string,
  ): Promise<string | null> {
    const institutionIds = await this.institutionsService.activeInstitutionIds(physicianId);

    if (requestedInstitutionId) {
      if (!institutionIds.includes(requestedInstitutionId)) {
        throw new ForbiddenException('Médico não pertence à instituição informada');
      }
      return requestedInstitutionId;
    }

    return institutionIds.length === 1 ? institutionIds[0]! : null;
  }

  /**
   * CC-019 — protocolo institucional só nasce de quem tem vínculo ativo com a
   * instituição. Antes, qualquer médico criava (ou revisava) protocolo em
   * nome de outro hospital informando o `institutionId` dele.
   */
  private async assertMember(physicianId: string, institutionId: string | undefined) {
    if (!institutionId) return;
    await this.resolveInstitutionId(physicianId, institutionId);
  }
}
