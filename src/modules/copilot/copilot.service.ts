import { Injectable } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { InferenceQueueService } from '../queue/inference-queue.service';
import type { AnalyzeInput } from './schemas/copilot.schemas';
import type { OrchestratorResult, StreamEvent } from './orchestrator/orchestrator.service';

@Injectable()
export class CopilotService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly queue: InferenceQueueService,
  ) {}

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    return this.orchestrator.analyze(physicianId, encounterId, input);
  }

  stream(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): AsyncGenerator<StreamEvent> {
    return this.orchestrator.analyzeStream(physicianId, encounterId, input);
  }

  async analyzeAsync(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<{ jobId: string }> {
    const jobId = await this.queue.enqueueAnalyze({ physicianId, encounterId, input });
    return { jobId };
  }

  async getJobStatus(jobId: string) {
    return this.queue.getJobStatus(jobId);
  }
}
