import { Module, forwardRef } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { UnderstandingService } from './understanding/understanding.service';
import { ProtocolEngineModule } from './protocol-engine/protocol-engine.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuthModule } from '../auth/auth.module';
import { EncountersModule } from '../encounters/encounters.module';
import { QueueModule } from '../queue/queue.module';
import { RecommendationDecisionsController } from './decisions/recommendation-decisions.controller';
import { RecommendationDecisionsService } from './decisions/recommendation-decisions.service';
import { CopilotFeedbackService } from './feedback/copilot-feedback.service';
import { CopilotFeedbackTriageController } from './feedback/copilot-feedback-triage.controller';

@Module({
  imports: [
    AiGatewayModule,
    AuthModule,
    EncountersModule,
    ProtocolEngineModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [
    CopilotController,
    RecommendationDecisionsController,
    CopilotFeedbackTriageController,
  ],
  providers: [
    CopilotService,
    OrchestratorService,
    RetrievalService,
    UnderstandingService,
    RecommendationDecisionsService,
    CopilotFeedbackService,
  ],
  exports: [CopilotService, OrchestratorService],
})
export class CopilotModule {}
