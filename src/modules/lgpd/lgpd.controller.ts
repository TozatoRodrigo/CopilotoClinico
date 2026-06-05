import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { LgpdService } from './lgpd.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { grantConsentSchema, requestErasureSchema } from './schemas/lgpd.schemas';
import { GrantConsentInput, RequestErasureInput } from './schemas/lgpd.schemas';

@Controller('lgpd')
@UseGuards(JwtAuthGuard)
export class LgpdController {
  constructor(private readonly lgpdService: LgpdService) {}

  @Post('consent')
  async grantConsent(
    @Request() req: { user: { sub: string } },
    @Body(new ZodValidationPipe(grantConsentSchema)) body: GrantConsentInput,
  ) {
    return this.lgpdService.grantConsent(req.user.sub, body.scope);
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
