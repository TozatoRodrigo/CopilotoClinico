import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { InferenceQueueService } from '../queue/inference-queue.service';
import { PrismaService } from '../../config/prisma.service';
import type { AnalyzeInput, RespondInput } from './schemas/copilot.schemas';
import type { OrchestratorResult, StreamEvent } from './orchestrator/orchestrator.service';

// UX-03 — mesmo default de orchestrator.service.ts (DEFAULT_MAX_TURNS).
// Duplicado aqui (em vez de importado) porque é uma constante, não lógica —
// e getLatestInteraction() não deveria depender de detalhe interno do
// orquestrador para expor um número de config puro.
const DEFAULT_MAX_TURNS = 5;

@Injectable()
export class CopilotService {
  constructor(
    @Inject(OrchestratorService) private readonly orchestrator: OrchestratorService,
    @Inject(InferenceQueueService) private readonly queue: InferenceQueueService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    return this.orchestrator.analyze(physicianId, encounterId, input);
  }

  async respond(
    physicianId: string,
    encounterId: string,
    input: RespondInput,
  ): Promise<OrchestratorResult> {
    return this.orchestrator.continueAnalysis(physicianId, encounterId, input);
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

  async getJobStatus(physicianId: string, jobId: string) {
    return this.queue.getJobStatus(jobId, physicianId);
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
        // UX-03 — turno persistido, para o indicador "Rodada N de M"
        // funcionar mesmo num carregamento fresco de página (sem
        // sessionStorage), não só durante a sessão de conversa ao vivo.
        turnIndex: true,
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
      turnIndex: interaction.turnIndex,
      maxTurns: this.config.get<number>('COPILOT_MAX_TURNS', DEFAULT_MAX_TURNS),
    };
  }
}
