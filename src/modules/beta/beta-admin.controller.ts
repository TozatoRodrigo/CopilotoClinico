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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { BetaActivationService } from './beta-activation.service';
import { BetaInviteService } from './beta-invite.service';
import { BetaWaitlistService } from './beta-waitlist.service';
import {
  activationQuerySchema,
  approveWaitlistSchema,
  createInvitesSchema,
  waitlistQuerySchema,
  type ActivationQuery,
  type ApproveWaitlistInput,
  type CreateInvitesInput,
  type WaitlistQuery,
} from './schemas/beta.schemas';

type AdminRequest = { user: { physicianId: string } };

/**
 * CC-702 — console admin do beta: lotes de convites, usos, lista de espera
 * (aprovar gera convite; apagar atende o pedido da pessoa) e a métrica de
 * ativação que alimenta o painel da CC-705.
 *
 * Só ADMIN gerencia convites e lista (a resposta traz e-mails). A ativação
 * só tem contagens, então Compliance também lê.
 */
@Controller('admin/beta')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BetaAdminController {
  constructor(
    @Inject(BetaInviteService) private readonly invites: BetaInviteService,
    @Inject(BetaWaitlistService) private readonly waitlist: BetaWaitlistService,
    @Inject(BetaActivationService) private readonly activation: BetaActivationService,
  ) {}

  @Get('invites')
  listInvites() {
    return this.invites.list();
  }

  @Post('invites')
  async createInvites(
    @Request() req: AdminRequest,
    @Body(new ZodValidationPipe(createInvitesSchema)) body: CreateInvitesInput,
  ) {
    return { invites: await this.invites.createBatch(req.user.physicianId, body) };
  }

  @Post('invites/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revokeInvite(@Request() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.invites.revoke(req.user.physicianId, id);
  }

  @Get('waitlist')
  listWaitlist(@Query(new ZodValidationPipe(waitlistQuerySchema)) query: WaitlistQuery) {
    return this.waitlist.list(query);
  }

  @Post('waitlist/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveWaitlistSchema)) body: ApproveWaitlistInput,
  ) {
    return this.waitlist.approve(req.user.physicianId, id, body);
  }

  @Delete('waitlist/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWaitlist(@Request() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.waitlist.remove(req.user.physicianId, id);
  }

  @Get('activation')
  @Roles('ADMIN', 'COMPLIANCE')
  activationReport(@Query(new ZodValidationPipe(activationQuerySchema)) query: ActivationQuery) {
    return this.activation.report(query.days);
  }
}
