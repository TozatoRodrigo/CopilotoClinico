import { Module, type Provider } from '@nestjs/common';
import { KnowledgeCardIndexModule } from '../card-index/knowledge-card-index.module';
import { CARD_RELEVANCE_GATE, SimilarityThemeGate } from './card-relevance-gate';
import { ReviewedCardRetrievalService } from './reviewed-card-retrieval.service';

/**
 * Os providers da busca de cartões aplicáveis. A CC-407 troca o portão aqui
 * (`CARD_RELEVANCE_GATE`), sem mexer na busca nem na decisão.
 */
export const REVIEWED_CARD_RETRIEVAL_PROVIDERS: Provider[] = [
  ReviewedCardRetrievalService,
  { provide: CARD_RELEVANCE_GATE, useClass: SimilarityThemeGate },
];

/**
 * CC-408 — cartões revisados aplicáveis a um caso, para a decisão do Copiloto
 * e, na CC-501, para a pergunta rápida. Sem controller.
 */
@Module({
  imports: [KnowledgeCardIndexModule],
  providers: REVIEWED_CARD_RETRIEVAL_PROVIDERS,
  exports: [ReviewedCardRetrievalService],
})
export class KnowledgeCardRetrievalModule {}
