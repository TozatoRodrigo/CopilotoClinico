import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { GuidelinesModule } from '../guidelines/guidelines.module';
import { KnowledgeCardsController } from './knowledge-cards.controller';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';
import { KnowledgeCardIndexModule } from './card-index/knowledge-card-index.module';
import { CardIndexCronService } from '../../workers/card-index-cron.service';
import { PublishedKnowledgeCardsController } from './published-knowledge-cards.controller';
import { CardReviewController } from './review/card-review.controller';
import { CardReviewService } from './review/card-review.service';
import { CrossReviewService } from './review/cross-review.service';

/**
 * CC-402/CC-403 (ADR-019) — cartões revisados; CC-404 — a fila de revisão
 * do celular; CC-411 — a revisão cruzada. AuditService vem do AuditModule
 * global. CC-406 — aprovar e arquivar atualizam o índice semântico, e a
 * varredura diária tira o que venceu.
 */
@Module({
  imports: [AiGatewayModule, GuidelinesModule, KnowledgeCardIndexModule],
  controllers: [KnowledgeCardsController, PublishedKnowledgeCardsController, CardReviewController],
  providers: [
    KnowledgeCardsService,
    KnowledgeCardDraftService,
    CardIndexCronService,
    CardReviewService,
    CrossReviewService,
  ],
  exports: [KnowledgeCardsService, KnowledgeCardDraftService],
})
export class KnowledgeCardsModule {}
