import { Module, forwardRef } from '@nestjs/common';
import { InferenceQueueService } from './inference-queue.service';
import { InferenceWorkerService } from './inference-worker.service';
import { CopilotModule } from '../copilot/copilot.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [forwardRef(() => CopilotModule), AuditModule],
  providers: [InferenceQueueService, InferenceWorkerService],
  exports: [InferenceQueueService],
})
export class QueueModule {}
