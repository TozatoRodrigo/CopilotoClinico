import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { AllowWithoutLegalAcceptance } from '../../shared/decorators/legal-acceptance.decorator';
import type { LegalStatus } from '../../shared/contracts/legal';
import { LegalDocumentsService } from './legal-documents.service';
import { acceptLegalDocumentsSchema, type AcceptLegalDocumentsInput } from './legal.schemas';

/**
 * CC-905 — o que o médico precisa aceitar e o aceite. Fora do gate: é por
 * aqui que quem está bloqueado sai do bloqueio.
 */
@Controller('legal')
@UseGuards(JwtAuthGuard)
@AllowWithoutLegalAcceptance()
export class LegalController {
  constructor(
    @Inject(LegalDocumentsService) private readonly legalDocuments: LegalDocumentsService,
  ) {}

  @Get('status')
  status(@Request() req: { user: { physicianId: string } }): Promise<LegalStatus> {
    return this.legalDocuments.status(req.user.physicianId);
  }

  @Post('acceptances')
  @HttpCode(HttpStatus.OK)
  accept(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(acceptLegalDocumentsSchema)) body: AcceptLegalDocumentsInput,
  ): Promise<LegalStatus> {
    return this.legalDocuments.accept(req.user.physicianId, body.documentIds);
  }
}
