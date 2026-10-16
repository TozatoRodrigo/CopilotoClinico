import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { ShiftReviewService } from '../modules/shift-review/shift-review.service';
import { REVIEW_TIME_ZONE } from '../modules/shift-review/review-period';

/**
 * CC-801 — job semanal da revisão do plantão.
 *
 * Segunda-feira às 10:00 (Brasília) gera a revisão da semana de quem teve
 * análise nos últimos 7 dias: ao abrir o Plantão, o médico já encontra
 * "Revise seu plantão" pronta. Com `COPILOT_SHIFT_REVIEW` desligada, não faz
 * nada. Mais de uma instância da API rodando o job não duplica revisão: o
 * índice único (médico, semana) fica com a primeira.
 */
@Injectable()
export class ShiftReviewCronService {
  private readonly logger = new Logger(ShiftReviewCronService.name);

  constructor(@Inject(ShiftReviewService) private readonly reviews: ShiftReviewService) {}

  @Cron('0 10 * * 1', { name: 'shift-review-weekly', timeZone: REVIEW_TIME_ZONE })
  async generateWeeklyReviews(): Promise<void> {
    if (!this.reviews.isEnabled()) return;
    try {
      const { generated, failed } = await this.reviews.generateWeekly();
      this.logger.log(`SHIFT_REVIEW_WEEKLY generated=${generated} failed=${failed}`);
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : 'unknown';
      this.logger.error(`SHIFT_REVIEW_WEEKLY_ERROR error=${name}`);
      if (process.env.SENTRY_DSN) {
        Sentry.captureMessage('SHIFT_REVIEW_WEEKLY_ERROR', {
          level: 'error',
          tags: { component: 'shift-review' },
          extra: { errorName: name },
        });
      }
    }
  }
}
