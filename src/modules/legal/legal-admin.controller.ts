import { Body, Controller, Get, Inject, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { AllowWithoutLegalAcceptance } from '../../shared/decorators/legal-acceptance.decorator';
import type { LegalAdminOverview, LegalDocumentView } from '../../shared/contracts/legal';
import { LegalDocumentsService } from './legal-documents.service';
import { publishLegalDocumentSchema, type PublishLegalDocumentInput } from './legal.schemas';

/**
 * CC-905 — console admin dos documentos legais. Compliance acompanha o
 * percentual de aceite; publicar uma versão (que reabre o aceite de todo
 * mundo) é só do ADMIN. Fora do gate para que uma publicação errada possa ser
 * corrigida mesmo por quem ainda não aceitou.
 */
@Controller('admin/legal/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@AllowWithoutLegalAcceptance()
export class LegalAdminController {
  constructor(
    @Inject(LegalDocumentsService) private readonly legalDocuments: LegalDocumentsService,
  ) {}

  @Get()
  @Roles('COMPLIANCE', 'ADMIN')
  overview(): Promise<LegalAdminOverview> {
    return this.legalDocuments.adminOverview();
  }

  @Post()
  @Roles('ADMIN')
  publish(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(publishLegalDocumentSchema)) body: PublishLegalDocumentInput,
  ): Promise<LegalDocumentView> {
    return this.legalDocuments.publish(req.user.physicianId, body);
  }
}
