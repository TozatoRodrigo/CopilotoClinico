import { Injectable } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import type { AnalyzeInput } from './schemas/copilot.schemas';
import type { OrchestratorResult } from './orchestrator/orchestrator.service';

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
}
