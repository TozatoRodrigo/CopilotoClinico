import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { GuidelinesModule } from '../guidelines/guidelines.module';
import { KnowledgeCardsController } from './knowledge-cards.controller';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';
import { KnowledgeCardIndexModule } from './card-index/knowledge-card-index.module';
import { CardIndexCronService } from '../../workers/card-index-cron.service';
import { PublishedKnowledgeCardsController } from './published-knowledge-cards.controller';
import { AnyCardImportService } from './any-import/any-card-import.service';

/**
 * CC-402/CC-403 (ADR-019) — cartões revisados. AuditService vem do AuditModule
 * global. CC-406 — aprovar e arquivar atualizam o índice semântico, e a
 * varredura diária tira o que venceu. CC-405 — importação do conteúdo do ANY
 * (`pnpm cards:import-any`) e o lote assinado pelo revisor indicado.
 */
@Module({
  imports: [AiGatewayModule, GuidelinesModule, KnowledgeCardIndexModule],
  controllers: [KnowledgeCardsController, PublishedKnowledgeCardsController],
  providers: [
    KnowledgeCardsService,
    KnowledgeCardDraftService,
    CardIndexCronService,
    AnyCardImportService,
  ],
  exports: [KnowledgeCardsService, KnowledgeCardDraftService, AnyCardImportService],
})
export class KnowledgeCardsModule {}
