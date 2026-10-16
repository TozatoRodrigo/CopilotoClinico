import { Module } from '@nestjs/common';
import { BetaActivationService } from './beta-activation.service';
import { BetaAdminController } from './beta-admin.controller';
import { BetaController } from './beta.controller';
import { BetaInviteService } from './beta-invite.service';
import { BetaParticipantService } from './beta-participant.service';
import { BetaWaitlistService } from './beta-waitlist.service';

/**
 * CC-702 — beta por convite. Importado pelo AuthModule (o cadastro consome o
 * convite na mesma transação); não importa o AuthModule de volta — os guards
 * só dependem da estratégia JWT, registrada globalmente.
 */
@Module({
  controllers: [BetaController, BetaAdminController],
  providers: [
    BetaInviteService,
    BetaWaitlistService,
    BetaParticipantService,
    BetaActivationService,
  ],
  exports: [BetaInviteService],
})
export class BetaModule {}
