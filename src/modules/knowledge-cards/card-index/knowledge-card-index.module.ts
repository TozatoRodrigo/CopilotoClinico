import { Module, type Provider } from '@nestjs/common';
import { AiGatewayModule } from '../../ai-gateway/ai-gateway.module';
import { CARD_EMBEDDER, GatewayCardEmbedder } from './card-embedder';
import { CardIndexService } from './card-index.service';

/**
 * Os providers do índice, para quem monta o contexto à mão com o próprio
 * gateway (o gabarito clínico, que grava as chamadas de IA).
 */
export const CARD_INDEX_PROVIDERS: Provider[] = [
  CardIndexService,
  { provide: CARD_EMBEDDER, useClass: GatewayCardEmbedder },
];

/**
 * CC-406 — índice semântico dos cartões, sem controller: a revisão
 * (KnowledgeCardsModule) o atualiza nas transições, e quem busca cartão o lê.
 * O provedor de embedding entra por `CARD_EMBEDDER` — trocá-lo é trocar a
 * implementação e reindexar.
 */
@Module({
  imports: [AiGatewayModule],
  providers: CARD_INDEX_PROVIDERS,
  exports: [CardIndexService, CARD_EMBEDDER],
})
export class KnowledgeCardIndexModule {}
