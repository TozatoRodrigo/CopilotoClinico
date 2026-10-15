import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { AuditService } from '../modules/audit/audit.service';

/**
 * Worker de verificação periódica da cadeia de hash do audit_log.
 *
 * Executa diariamente às 02:00 UTC (horário de baixa carga) e loga o resultado.
 * Só cadeia rompida alarma: ERROR no log e alerta Sentry, com ids e contagens
 * (LGPD-safe — nada do payload). "Legado não verificável" (ADR-015) é estado
 * conhecido e fixo da trilha anterior à serialização canônica: sai na linha
 * de sucesso, sem alarme.
 *
 * Referência: AUD-004 — https://app.clickup.com/t/90132565680/86ahx6ft7
 */
@Injectable()
export class AuditChainCronService {
  private readonly logger = new Logger(AuditChainCronService.name);

  constructor(private readonly auditService: AuditService) {}

  @Cron('0 2 * * *', { name: 'audit-chain-verify', timeZone: 'UTC' })
  async verifyAuditChain(): Promise<void> {
    this.logger.log('Starting daily audit chain integrity verification...');

    try {
      const result = await this.auditService.verifyChain();

      if (result.valid) {
        this.logger.log(
          `Audit chain verification PASSED — ${result.count} records verified ` +
            `(legacy: ${result.legacy.verified} verified, ` +
            `${result.legacy.unverifiable} unverifiable)`,
        );
        return;
      }

      this.logger.error(
        `AUDIT CHAIN INTEGRITY FAILURE — ` +
          `brokenAt=${result.brokenAt ?? 'unknown'} ` +
          `count=${result.count} ` +
          `message="${result.message ?? ''}"`,
      );
      if (process.env.SENTRY_DSN) {
        Sentry.captureMessage('AUDIT CHAIN INTEGRITY FAILURE', {
          level: 'error',
          tags: { component: 'audit', check: 'audit-chain-verify' },
          extra: {
            brokenAt: result.brokenAt ?? null,
            count: result.count,
            message: result.message ?? null,
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Audit chain verification failed with exception: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
