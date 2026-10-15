import { Module, forwardRef } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { UnderstandingService } from './understanding/understanding.service';
import { WebResearchService } from './research/web-research.service';
import { ProtocolEngineModule } from './protocol-engine/protocol-engine.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuthModule } from '../auth/auth.module';
import { EncountersModule } from '../encounters/encounters.module';
import { QueueModule } from '../queue/queue.module';
import { RecommendationDecisionsController } from './decisions/recommendation-decisions.controller';
import { RecommendationDecisionsService } from './decisions/recommendation-decisions.service';
import { CopilotFeedbackService } from './feedback/copilot-feedback.service';
import { CopilotFeedbackTriageController } from './feedback/copilot-feedback-triage.controller';
import { IntakeController } from './intake/intake.controller';
import { IntakeService } from './intake/intake.service';
import { ConversationService } from './intake/conversation.service';
import { KnowledgeCardRetrievalModule } from '../knowledge-cards/card-retrieval/knowledge-card-retrieval.module';

@Module({
  imports: [
    AiGatewayModule,
    AuthModule,
    EncountersModule,
    ProtocolEngineModule,
    // CC-408 — cartões revisados na decisão (COPILOT_REVIEWED_CARDS).
    KnowledgeCardRetrievalModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [
    CopilotController,
    RecommendationDecisionsController,
    CopilotFeedbackTriageController,
    IntakeController,
  ],
  providers: [
    CopilotService,
    OrchestratorService,
    RetrievalService,
    UnderstandingService,
    WebResearchService,
    RecommendationDecisionsService,
    CopilotFeedbackService,
    IntakeService,
    ConversationService,
  ],
  exports: [CopilotService, OrchestratorService],
})
export class CopilotModule {}
