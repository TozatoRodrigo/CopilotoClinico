import { Module } from '@nestjs/common';
import { InstitutionsModule } from '../institutions/institutions.module';
import { KnowledgeCardRetrievalModule } from '../knowledge-cards/card-retrieval/knowledge-card-retrieval.module';
import { KnowledgeGapsModule } from '../knowledge-gaps/knowledge-gaps.module';
import { KNOWLEDGE_GAP_RECORDER, StoredKnowledgeGapRecorder } from './knowledge-gap-recorder';
import { QuickQuestionController } from './quick-question.controller';
import { QuickQuestionService } from './quick-question.service';
import { ConfiguredScopeGuard } from './scope-guard/configured-scope-guard';
import { HeuristicScopeGuard } from './scope-guard/heuristic-scope-guard';
import { JEV_FETCH, JevScopeGuard } from './scope-guard/jev-scope-guard';
import { QUICK_QUESTION_SCOPE_GUARD } from './scope-guard/quick-question-scope-guard';

/**
 * CC-501 — pergunta rápida respondida por cartões revisados. Reaproveita a
 * busca e o portão da decisão (`KnowledgeCardRetrievalModule`); a lacuna
 * entra por `KNOWLEDGE_GAP_RECORDER` e vai para `knowledge_gaps` (CC-409).
 * AuditService vem do AuditModule global.
 *
 * CC-503 — a guarda de escopo entra por `QUICK_QUESTION_SCOPE_GUARD`: a
 * `ConfiguredScopeGuard` escolhe, a cada pergunta, a heurística ou o Jev.
 */
@Module({
  imports: [KnowledgeCardRetrievalModule, InstitutionsModule, KnowledgeGapsModule],
  controllers: [QuickQuestionController],
  providers: [
    QuickQuestionService,
    { provide: KNOWLEDGE_GAP_RECORDER, useClass: StoredKnowledgeGapRecorder },
    HeuristicScopeGuard,
    JevScopeGuard,
    { provide: JEV_FETCH, useFactory: (): typeof fetch => globalThis.fetch.bind(globalThis) },
    ConfiguredScopeGuard,
    { provide: QUICK_QUESTION_SCOPE_GUARD, useExisting: ConfiguredScopeGuard },
  ],
})
export class QuickQuestionModule {}
