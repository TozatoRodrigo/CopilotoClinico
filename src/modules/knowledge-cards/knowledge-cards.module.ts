import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { GuidelinesModule } from '../guidelines/guidelines.module';
import { KnowledgeCardsController } from './knowledge-cards.controller';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';
import { CardReviewController } from './review/card-review.controller';
import { CardReviewService } from './review/card-review.service';
import { CrossReviewService } from './review/cross-review.service';

/**
 * CC-402/CC-403 (ADR-019) — cartões revisados; CC-404 — a fila de revisão
 * do celular; CC-411 — a revisão cruzada. AuditService vem do AuditModule global.
 */
@Module({
  imports: [AiGatewayModule, GuidelinesModule],
  controllers: [KnowledgeCardsController, CardReviewController],
  providers: [
    KnowledgeCardsService,
    KnowledgeCardDraftService,
    CardReviewService,
    CrossReviewService,
  ],
  exports: [KnowledgeCardsService, KnowledgeCardDraftService],
})
export class KnowledgeCardsModule {}
