import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BetaActivationService } from './beta-activation.service';
import { BetaAdminController } from './beta-admin.controller';
import { BetaController } from './beta.controller';
import { BetaInviteService } from './beta-invite.service';
import { BetaParticipantService } from './beta-participant.service';
import { BetaWaitlistService } from './beta-waitlist.service';
import { BetaWeeklyController } from './beta-weekly.controller';
import { BetaWeeklyService } from './beta-weekly.service';

/**
 * CC-702 — beta por convite. Importado pelo AuthModule (o cadastro consome o
 * convite na mesma transação); não importa o AuthModule de volta — os guards
 * só dependem da estratégia JWT, registrada globalmente.
 *
 * CC-705 — o painel semanal reaproveita a agregação de `ai_calls` da CC-004,
 * por isso o AnalyticsModule.
 */
@Module({
  imports: [AnalyticsModule],
  controllers: [BetaController, BetaAdminController, BetaWeeklyController],
  providers: [
    BetaInviteService,
    BetaWaitlistService,
    BetaParticipantService,
    BetaActivationService,
    BetaWeeklyService,
  ],
  exports: [BetaInviteService],
})
export class BetaModule {}
