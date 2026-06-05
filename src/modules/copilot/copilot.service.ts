import { Injectable } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { EncountersService } from '../encounters/encounters.service';
import { PrismaService } from '../../config/prisma.service';
import type { AnalyzeInput } from './schemas/copilot.schemas';
import type { OrchestratorResult } from './orchestrator/orchestrator.service';

@Injectable()
export class CopilotService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly encounters: EncountersService,
    private readonly prisma: PrismaService,
  ) {}

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    return this.orchestrator.analyze(physicianId, encounterId, input);
  }

  async findLatestResult(physicianId: string, encounterId: string) {
    await this.encounters.findById(physicianId, encounterId);

    const interaction = await this.prisma.aiInteraction.findFirst({
      where: { encounterId },
      orderBy: { createdAt: 'desc' },
    });

    if (!interaction) {
      return null;
    }

    return {
      interactionId: interaction.id,
      output: interaction.rawOutput,
      citations: interaction.citations,
      metadata: {
        retrievedChunkIds: interaction.retrievedChunkIds,
        model: interaction.model,
        latencyMs: interaction.latencyMs,
        cost: interaction.cost,
        createdAt: interaction.createdAt,
      },
    };
  }
}
