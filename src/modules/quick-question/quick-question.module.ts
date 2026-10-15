import { Module } from '@nestjs/common';
import { InstitutionsModule } from '../institutions/institutions.module';
import { KnowledgeCardRetrievalModule } from '../knowledge-cards/card-retrieval/knowledge-card-retrieval.module';
import { KNOWLEDGE_GAP_RECORDER, LoggedKnowledgeGapRecorder } from './knowledge-gap-recorder';
import { QuickQuestionController } from './quick-question.controller';
import { QuickQuestionService } from './quick-question.service';

/**
 * CC-501 — pergunta rápida respondida por cartões revisados. Reaproveita a
 * busca e o portão da decisão (`KnowledgeCardRetrievalModule`); a lacuna
 * entra por `KNOWLEDGE_GAP_RECORDER` (hoje só log; a tabela do PR #185 troca
 * a implementação aqui). AuditService vem do AuditModule global.
 */
@Module({
  imports: [KnowledgeCardRetrievalModule, InstitutionsModule],
  controllers: [QuickQuestionController],
  providers: [
    QuickQuestionService,
    { provide: KNOWLEDGE_GAP_RECORDER, useClass: LoggedKnowledgeGapRecorder },
  ],
})
export class QuickQuestionModule {}
