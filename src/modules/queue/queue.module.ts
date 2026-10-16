import { Module, forwardRef } from '@nestjs/common';
import { InferenceQueueService } from './inference-queue.service';
import { InferenceWorkerService } from './inference-worker.service';
import { CopilotModule } from '../copilot/copilot.module';
import { AuditModule } from '../audit/audit.module';
import { LgpdModule } from '../lgpd/lgpd.module';

@Module({
  imports: [forwardRef(() => CopilotModule), AuditModule, LgpdModule],
  providers: [InferenceQueueService, InferenceWorkerService],
  exports: [InferenceQueueService],
})
export class QueueModule {}
