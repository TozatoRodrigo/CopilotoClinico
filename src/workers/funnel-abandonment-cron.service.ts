import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { ProductFunnelService } from '../modules/analytics/product-funnel.service';
import { ABANDONMENT_ALERT_THRESHOLD } from '../modules/analytics/product-funnel.types';

/**
 * Worker de monitoramento do funil do loop de decisão (F5).
 *
 * De hora em hora computa a taxa de abandono do loop (janela 24h) e dispara um
 * alerta Sentry quando ultrapassa o limiar (30% por padrão) — sinal de fricção
 * na UI do copiloto. O alerta carrega apenas números e razões (LGPD-safe).
 */
@Injectable()
export class FunnelAbandonmentCronService {
  private readonly logger = new Logger(FunnelAbandonmentCronService.name);

  constructor(private readonly funnelService: ProductFunnelService) {}

  @Cron('0 * * * *', { name: 'funnel-abandonment-check', timeZone: 'UTC' })
  async checkAbandonment(): Promise<void> {
    try {
      const funnel = await this.funnelService.getFunnel({ days: 1 });
      const { abandonmentRate, encountersWithBlockers, analysesStarted } = funnel.decisionLoop;

      this.logger.debug(
        `Loop abandonment (24h): ${Math.round(abandonmentRate * 100)}% ` +
          `(${funnel.decisionLoop.abandoned}/${encountersWithBlockers} encounters, ` +
          `${analysesStarted} analyses)`,
      );

      if (encountersWithBlockers === 0) return;

      if (abandonmentRate > ABANDONMENT_ALERT_THRESHOLD) {
        this.logger.warn(
          `Decision loop abandonment above threshold: ` +
            `${Math.round(abandonmentRate * 100)}% > ${Math.round(ABANDONMENT_ALERT_THRESHOLD * 100)}%`,
        );

        // LGPD-safe: counts and ratios only — no clinical content.
        if (process.env.SENTRY_DSN) {
          Sentry.captureMessage(
            `Decision loop abandonment above ${Math.round(ABANDONMENT_ALERT_THRESHOLD * 100)}%`,
            {
              level: 'warning',
              tags: { component: 'copilot', funnel: 'decision_loop' },
              extra: {
                abandonmentRate: Math.round(abandonmentRate * 1000) / 1000,
                threshold: ABANDONMENT_ALERT_THRESHOLD,
                abandoned: funnel.decisionLoop.abandoned,
                encountersWithBlockers,
                analysesStarted,
                windowDays: 1,
              },
            },
          );
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Funnel abandonment check failed with exception: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
