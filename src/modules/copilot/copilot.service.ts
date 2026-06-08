import { Injectable } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import type { AnalyzeInput } from './schemas/copilot.schemas';
import type { OrchestratorResult, StreamEvent } from './orchestrator/orchestrator.service';

@Injectable()
export class CopilotService {
  constructor(private readonly orchestrator: OrchestratorService) {}

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
}
