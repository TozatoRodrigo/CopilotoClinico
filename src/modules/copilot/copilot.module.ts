import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval/retrieval.service';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';

@Module({
  imports: [AiGatewayModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class CopilotModule {}
