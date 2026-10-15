import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../../ai-gateway/ai-gateway.module';
import { CARD_EMBEDDER, GatewayCardEmbedder } from './card-embedder';
import { CardIndexService } from './card-index.service';

/**
 * CC-406 — índice semântico dos cartões, sem controller: a revisão
 * (KnowledgeCardsModule) o atualiza nas transições, e quem busca cartão o lê.
 * O provedor de embedding entra por `CARD_EMBEDDER` — trocá-lo é trocar a
 * implementação e reindexar.
 */
@Module({
  imports: [AiGatewayModule],
  providers: [CardIndexService, { provide: CARD_EMBEDDER, useClass: GatewayCardEmbedder }],
  exports: [CardIndexService],
})
export class KnowledgeCardIndexModule {}
