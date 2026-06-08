import { Injectable, NotFoundException } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { InferenceQueueService } from '../queue/inference-queue.service';
import { PrismaService } from '../../config/prisma.service';
import type { AnalyzeInput } from './schemas/copilot.schemas';
import type { OrchestratorResult, StreamEvent } from './orchestrator/orchestrator.service';

@Injectable()
export class CopilotService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly queue: InferenceQueueService,
    private readonly prisma: PrismaService,
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

  async getLatestInteraction(physicianId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, physicianId },
      select: { id: true },
    });

    if (!encounter) throw new NotFoundException('Encounter not found');

    const interaction = await this.prisma.aiInteraction.findFirst({
      where: { encounterId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rawOutput: true,
        citations: true,
        uncertainty: true,
        uncertaintyReason: true,
        createdAt: true,
      },
    });

    if (!interaction) throw new NotFoundException('No analysis found for this encounter');

    return {
      interactionId: interaction.id,
      output: interaction.rawOutput,
      citations: interaction.citations,
      uncertainty: interaction.uncertainty,
      uncertaintyReason: interaction.uncertaintyReason,
      createdAt: interaction.createdAt,
    };
  }
}
