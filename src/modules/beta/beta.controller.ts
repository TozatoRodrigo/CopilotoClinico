import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Query,
  Req,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { clientIpForAudit, type ClientIpRequest } from '../../shared/http/client-ip';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { BetaInviteService } from './beta-invite.service';
import { BetaParticipantService } from './beta-participant.service';
import { BetaWaitlistService } from './beta-waitlist.service';
import {
  acceptTermsSchema,
  betaProfileSchema,
  registrationStatusQuerySchema,
  waitlistRequestSchema,
  type AcceptTermsInput,
  type BetaProfileInput,
  type RegistrationStatusQuery,
  type WaitlistRequestInput,
} from './schemas/beta.schemas';

type AuthenticatedRequest = ClientIpRequest & { user: { physicianId: string } };

/**
 * CC-702 — o lado do médico no beta: o que a tela de cadastro consulta antes
 * do envio (público), a lista de espera (pública) e o onboarding de quem
 * entrou por convite (autenticado).
 */
@Controller('beta')
export class BetaController {
  constructor(
    @Inject(BetaInviteService) private readonly invites: BetaInviteService,
    @Inject(BetaWaitlistService) private readonly waitlist: BetaWaitlistService,
    @Inject(BetaParticipantService) private readonly participants: BetaParticipantService,
  ) {}

  /** Público. O código fica na querystring, que o log de acesso descarta. */
  @Get('registration')
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  registration(
    @Query(new ZodValidationPipe(registrationStatusQuerySchema)) query: RegistrationStatusQuery,
  ) {
    return this.invites.registrationStatus(query.code);
  }

  /** Público. Sempre 202 com o mesmo corpo: não confirma se o e-mail existe. */
  @Post('waitlist')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  joinWaitlist(
    @Body(new ZodValidationPipe(waitlistRequestSchema)) body: WaitlistRequestInput,
    @Req() req: ClientIpRequest,
  ) {
    // CC-026 — o IP da trilha é o do médico, não o do Traefik (`req.ips` só
    // existe com trustProxy, que a API não liga).
    return this.waitlist.join(body, clientIpForAudit(req));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: AuthenticatedRequest) {
    return this.participants.me(req.user.physicianId);
  }

  @Post('me/terms')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  acceptTerms(
    @Request() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(acceptTermsSchema)) body: AcceptTermsInput,
  ) {
    return this.participants.acceptTerms(req.user.physicianId, body.version, clientIpForAudit(req));
  }

  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  saveProfile(
    @Request() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(betaProfileSchema)) body: BetaProfileInput,
  ) {
    return this.participants.saveProfile(req.user.physicianId, body);
  }
}
