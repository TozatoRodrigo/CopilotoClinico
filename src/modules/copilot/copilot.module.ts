import { Module, forwardRef } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuthModule } from '../auth/auth.module';
import { EncountersModule } from '../encounters/encounters.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [AiGatewayModule, AuthModule, EncountersModule, forwardRef(() => QueueModule)],
  controllers: [CopilotController],
  providers: [CopilotService, OrchestratorService, RetrievalService],
  exports: [CopilotService, OrchestratorService],
})
export class CopilotModule {}
