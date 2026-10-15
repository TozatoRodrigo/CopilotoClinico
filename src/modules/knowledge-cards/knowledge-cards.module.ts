import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { GuidelinesModule } from '../guidelines/guidelines.module';
import { KnowledgeCardsController } from './knowledge-cards.controller';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';

/** CC-402/CC-403 (ADR-017) — cartões revisados. AuditService vem do AuditModule global. */
@Module({
  imports: [AiGatewayModule, GuidelinesModule],
  controllers: [KnowledgeCardsController],
  providers: [KnowledgeCardsService, KnowledgeCardDraftService],
  exports: [KnowledgeCardsService, KnowledgeCardDraftService],
})
export class KnowledgeCardsModule {}
