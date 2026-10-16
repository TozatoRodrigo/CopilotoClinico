import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { AudioRetentionService } from '../modules/audio/audio-retention.service';

/**
 * Worker de retenção das capturas de áudio (LGPD — minimização).
 *
 * De hora em hora elimina o áudio das capturas com `retainUntil` vencido. Hora
 * em hora, e não diário, para o áudio não sobreviver mais que ~1h ao prazo
 * prometido em docs/compliance/LGPD.md ("Capturas de áudio").
 *
 * `waitForCompletion` evita sobreposição no mesmo processo; entre réplicas, a
 * eliminação condicional do AudioRetentionService garante que cada captura é
 * eliminada e auditada uma única vez. Captura que falha continua elegível na
 * próxima hora e dispara alerta Sentry — só contagens (LGPD-safe).
 */
@Injectable()
export class AudioRetentionCronService {
  private readonly logger = new Logger(AudioRetentionCronService.name);

  constructor(private readonly retention: AudioRetentionService) {}

  @Cron('15 * * * *', { name: 'audio-retention-purge', timeZone: 'UTC', waitForCompletion: true })
  async purgeExpiredAudio(): Promise<void> {
    try {
      const { purged, failed } = await this.retention.purgeExpired();

      if (purged === 0 && failed === 0) {
        this.logger.debug('Audio retention purge: no expired captures');
        return;
      }

      this.logger.log(`Audio retention purge: ${purged} purged, ${failed} failed`);

      if (failed > 0) {
        // Nível ERROR para acionar alertas externos: há áudio além do prazo.
        this.logger.error(
          `AUDIO RETENTION PURGE INCOMPLETE — ${failed} expired capture(s) still hold audio`,
        );
        if (process.env.SENTRY_DSN) {
          Sentry.captureMessage('Audio retention purge incomplete', {
            level: 'error',
            tags: { component: 'audio', job: 'audio-retention-purge' },
            extra: { purged, failed },
          });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Audio retention purge failed with exception: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (process.env.SENTRY_DSN) {
        Sentry.captureException(err, {
          tags: { component: 'audio', job: 'audio-retention-purge' },
        });
      }
    }
  }
}
