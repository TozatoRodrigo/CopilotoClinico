import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CardIndexService } from '../modules/knowledge-cards/card-index/card-index.service';

/**
 * CC-406 — varredura diária do índice dos cartões, às 04:00 UTC: tira o que
 * venceu (a busca já o ignora pela data; isto só limpa) e completa o vetor do
 * cartão publicado enquanto o provedor de embedding estava fora. Com
 * `EMBEDDING_PROVIDER=none`, nenhuma chamada de embedding sai daqui.
 *
 * Falha vira log de ERROR, que aciona os alertas; a próxima noite tenta de novo.
 */
@Injectable()
export class CardIndexCronService {
  private readonly logger = new Logger(CardIndexCronService.name);

  constructor(@Inject(CardIndexService) private readonly cardIndex: CardIndexService) {}

  @Cron('0 4 * * *', { name: 'knowledge-card-index-sweep', timeZone: 'UTC' })
  async runDailySweep(): Promise<void> {
    try {
      await this.cardIndex.syncAll();
    } catch (error) {
      this.logger.error(
        `CARD_INDEX_SWEEP_FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
