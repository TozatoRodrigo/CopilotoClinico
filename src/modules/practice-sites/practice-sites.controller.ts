import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  practiceSiteInputSchema,
  type PracticeSiteInputBody,
} from './schemas/practice-site.schemas';
import { PracticeSitesService } from './practice-sites.service';

/**
 * CC-602 — locais de plantão do médico autenticado (Configurações → Locais
 * de plantão). O médico vem sempre do token, nunca do corpo.
 */
@Controller('physicians/me/practice-sites')
@UseGuards(JwtAuthGuard)
export class PracticeSitesController {
  constructor(@Inject(PracticeSitesService) private readonly sites: PracticeSitesService) {}

  @Get()
  list(@Request() req: { user: { physicianId: string } }) {
    return this.sites.list(req.user.physicianId);
  }

  @Post()
  create(
    @Request() req: { user: { physicianId: string } },
    @Body(new ZodValidationPipe(practiceSiteInputSchema)) body: PracticeSiteInputBody,
  ) {
    return this.sites.create(req.user.physicianId, body);
  }

  @Put(':siteId')
  update(
    @Request() req: { user: { physicianId: string } },
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body(new ZodValidationPipe(practiceSiteInputSchema)) body: PracticeSiteInputBody,
  ) {
    return this.sites.update(req.user.physicianId, siteId, body);
  }

  @Delete(':siteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Request() req: { user: { physicianId: string } },
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.sites.remove(req.user.physicianId, siteId);
  }
}
