import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../modules/audit/audit.service';

/**
 * Worker de verificação periódica da cadeia de hash do audit_log.
 *
 * Executa diariamente às 02:00 UTC (horário de baixa carga) e loga o resultado.
 * Em caso de cadeia corrompida, loga em nível ERROR para acionar alertas
 * externos (ex: Sentry, PagerDuty) via integração de log.
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
        this.logger.log(`Audit chain verification PASSED — ${result.count} records verified`);
      } else {
        // Nível ERROR para acionar alertas externos
        this.logger.error(
          `AUDIT CHAIN INTEGRITY FAILURE — ` +
            `brokenAt=${result.brokenAt ?? 'unknown'} ` +
            `count=${result.count} ` +
            `message="${result.message ?? ''}"`,
        );
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
