import { Module } from '@nestjs/common';
import {
  EncounterMentoringController,
  MentorQueueController,
  MentoringAdminController,
  MentoringController,
} from './mentoring.controller';
import { MentorGuard, MentoringEnabledGuard } from './mentoring.guards';
import { MentoringService } from './mentoring.service';
import { MentoringAdminService } from './mentoring-admin.service';
import { LogMentoringNotifier, MENTORING_NOTIFIER } from './mentoring.notifier';

/**
 * CC-707 — mentoria em modo concierge, atrás de `COPILOT_MENTORING` (off).
 * Prisma e AuditService vêm de módulos globais.
 */
@Module({
  controllers: [
    MentoringController,
    EncounterMentoringController,
    MentorQueueController,
    MentoringAdminController,
  ],
  providers: [
    MentoringService,
    MentoringAdminService,
    MentoringEnabledGuard,
    MentorGuard,
    // Troque por um notificador de e-mail quando houver provedor (ver mentoring.notifier.ts).
    { provide: MENTORING_NOTIFIER, useClass: LogMentoringNotifier },
  ],
})
export class MentoringModule {}
