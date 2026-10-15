import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KnowledgeGapsService } from '../modules/knowledge-gaps/knowledge-gaps.service';

/**
 * CC-409 — varredura diária das lacunas, às 04:30 UTC (depois da do índice
 * dos cartões): retenção de 180 dias, agrupamento do que ficou sem grupo e
 * limpeza dos grupos abertos vazios.
 *
 * Falha vira log de ERROR e Sentry; a próxima noite tenta de novo.
 */
@Injectable()
export class KnowledgeGapCronService {
  private readonly logger = new Logger(KnowledgeGapCronService.name);

  constructor(@Inject(KnowledgeGapsService) private readonly gaps: KnowledgeGapsService) {}

  @Cron('30 4 * * *', { name: 'knowledge-gap-maintenance', timeZone: 'UTC' })
  async runDailyMaintenance(): Promise<void> {
    try {
      await this.gaps.maintain();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`KNOWLEDGE_GAP_MAINTENANCE_FAILED: ${reason}`);
      Sentry.captureMessage(`KNOWLEDGE_GAP_MAINTENANCE_FAILED: ${reason}`, 'error');
    }
  }
}
