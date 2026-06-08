import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupHealthService } from '../modules/observability/backup-health.service';

/**
 * Worker de verificação de saúde do backup/banco de dados.
 *
 * Executa diariamente às 03:00 UTC para validar que o banco está acessível
 * e com dados íntegros (equivalente ao "teste de restore" exigido por OPS-003).
 *
 * A execução mensal do restore real é realizada por pipeline de infraestrutura;
 * este job garante observabilidade contínua da integridade do DB.
 *
 * Logs em nível ERROR acionam alertas externos via integração de log.
 */
@Injectable()
export class BackupHealthCronService {
  private readonly logger = new Logger(BackupHealthCronService.name);

  constructor(private readonly backupHealth: BackupHealthService) {}

  @Cron('0 3 * * *', { name: 'backup-health-check', timeZone: 'UTC' })
  async runDailyCheck(): Promise<void> {
    this.logger.log('Starting daily backup health check...');
    const result = await this.backupHealth.check();

    if (!result.healthy) {
      // Mensagem estruturada para facilitar alertas automáticos
      this.logger.error(
        `DAILY_BACKUP_HEALTH FAILED at ${result.checkedAt.toISOString()} — ${result.message}`,
      );
    }
  }
}
