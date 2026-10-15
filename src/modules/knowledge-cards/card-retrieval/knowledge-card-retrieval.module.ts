import { Module, type Provider } from '@nestjs/common';
import { JEV_FETCH_PROVIDER } from '../../jev/jev-client';
import { KnowledgeCardIndexModule } from '../card-index/knowledge-card-index.module';
import { CARD_RELEVANCE_GATE, SimilarityThemeGate } from './card-relevance-gate';
import { CARD_RERANKER, CARD_RERANKER_FETCH_PROVIDER, TeiCardReranker } from './card-reranker';
import { ConfiguredRelevanceGate } from './configured-relevance-gate';
import { JevRelevanceGate } from './jev-relevance-gate';
import { RerankerRelevanceGate } from './reranker-relevance-gate';
import { ReviewedCardRetrievalService } from './reviewed-card-retrieval.service';

/**
 * Os providers da busca de cartões aplicáveis. O portão (`CARD_RELEVANCE_GATE`)
 * é a `ConfiguredRelevanceGate` da CC-407: por limiar, Jev ou reranker, pela
 * flag `CARD_RELEVANCE_GATE`, sem mexer na busca nem na decisão.
 */
export const REVIEWED_CARD_RETRIEVAL_PROVIDERS: Provider[] = [
  ReviewedCardRetrievalService,
  SimilarityThemeGate,
  JEV_FETCH_PROVIDER,
  JevRelevanceGate,
  CARD_RERANKER_FETCH_PROVIDER,
  { provide: CARD_RERANKER, useClass: TeiCardReranker },
  RerankerRelevanceGate,
  ConfiguredRelevanceGate,
  { provide: CARD_RELEVANCE_GATE, useExisting: ConfiguredRelevanceGate },
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
