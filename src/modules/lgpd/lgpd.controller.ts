import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Inject,
} from '@nestjs/common';
import { LgpdService } from './lgpd.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AllowWithoutLegalAcceptance } from '../../shared/decorators/legal-acceptance.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { grantConsentSchema, requestErasureSchema } from './schemas/lgpd.schemas';
import { GrantConsentInput, RequestErasureInput } from './schemas/lgpd.schemas';

@Controller('lgpd')
@UseGuards(JwtAuthGuard)
// CC-905 — exportar, eliminar e revogar consentimento são direitos do titular
// (LGPD, Art. 18): seguem abertos para quem ainda não aceitou os termos novos.
@AllowWithoutLegalAcceptance()
export class LgpdController {
  constructor(@Inject(LgpdService) private readonly lgpdService: LgpdService) {}

  @Post('consent')
  async grantConsent(
    @Request() req: { user: { sub: string } },
    @Body(new ZodValidationPipe(grantConsentSchema)) body: GrantConsentInput,
  ) {
    return this.lgpdService.grantConsent(req.user.sub, body.scope);
  }

  @Get('consent')
  async listConsentScopes(@Request() req: { user: { sub: string } }) {
    return this.lgpdService.listConsentScopes(req.user.sub);
  }

  @Delete('consent/:scope')
  async revokeConsent(@Request() req: { user: { sub: string } }, @Param('scope') scope: string) {
    return this.lgpdService.revokeConsent(req.user.sub, scope);
  }

  @Get('export')
  async exportData(@Request() req: { user: { sub: string } }) {
    return this.lgpdService.exportPhysicianData(req.user.sub);
  }

  @Post('erasure')
  async requestErasure(
    @Request() req: { user: { sub: string } },
    @Body(new ZodValidationPipe(requestErasureSchema)) _body: RequestErasureInput,
  ) {
    return this.lgpdService.requestErasure(req.user.sub);
  }
}
