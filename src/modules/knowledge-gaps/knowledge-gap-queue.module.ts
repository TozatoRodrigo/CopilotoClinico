import { Module } from '@nestjs/common';
import { KnowledgeCardsModule } from '../knowledge-cards/knowledge-cards.module';
import { KnowledgeGapCronService } from '../../workers/knowledge-gap-cron.service';
import { KnowledgeGapQueueController } from './knowledge-gap-queue.controller';
import { KnowledgeGapQueueService } from './knowledge-gap-queue.service';
import { KnowledgeGapsModule } from './knowledge-gaps.module';

/**
 * CC-409 — fila de criação de cartões (admin) e a varredura diária das
 * lacunas. Importa os cartões pelo rascunho por IA (CC-403); os cartões
 * importam só o registro (`KnowledgeGapsModule`), sem ciclo.
 */
@Module({
  imports: [KnowledgeGapsModule, KnowledgeCardsModule],
  controllers: [KnowledgeGapQueueController],
  providers: [KnowledgeGapQueueService, KnowledgeGapCronService],
})
export class KnowledgeGapQueueModule {}
