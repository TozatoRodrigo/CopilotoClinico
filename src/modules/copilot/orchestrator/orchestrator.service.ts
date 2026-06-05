import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { EncountersService } from '../../encounters/encounters.service';
import { maskPII } from '../guardrails/pii-filter';
import { scanForInjection } from '../guardrails/injection-defense';
import { buildPrompt, type EncounterContext } from './prompt-builder';
import { validateOutput, type CopilotOutput } from '../guardrails/output-validator';
import type { AnalyzeInput } from '../schemas/copilot.schemas';

export interface OrchestratorResult {
  interactionId: string;
  output: CopilotOutput;
  citations: Array<{
    chunkId: string;
    source: string;
    sourceVersion: string;
    text: string;
  }>;
  metadata: {
    piiDetected: boolean;
    injectionDetected: boolean;
    chunksRetrieved: number;
    latencyMs: number;
    cost: number;
    model: string;
  };
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly retrieval: RetrievalService,
    private readonly encounters: EncountersService,
  ) {}

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    const start = Date.now();

    await this.encounters.findById(physicianId, encounterId);

    const piiResult = maskPII(input.caseText);
    this.logger.debug(
      `PII detection: ${piiResult.hasPII ? 'FOUND' : 'NONE'} (${piiResult.detections.length} items)`,
    );

    const injectionResult = scanForInjection(piiResult.redacted);
    if (!injectionResult.safe) {
      this.logger.warn(`Injection detected: ${injectionResult.reasons.join(', ')}`);
      throw new BadRequestException({
        message: 'Input contains potentially unsafe content',
        reasons: injectionResult.reasons,
      });
    }

    const retrievalResult = await this.retrieval.search(piiResult.redacted, 5);
    this.logger.debug(`Retrieved ${retrievalResult.totalRetrieved} chunks`);

    const encounterContext: EncounterContext = {
      hasCT: input.context.hasCT,
      isSus: input.context.isSus,
      hasLab: input.context.hasLab,
      hasICU: input.context.hasICU,
    };

    const prompt = buildPrompt({
      caseText: piiResult.redacted,
      retrievedChunks: retrievalResult.chunks.map((c) => ({
        chunkId: c.id,
        text: c.text,
        source: c.source,
        sourceVersion: c.sourceVersion,
        score: c.score,
      })),
      context: encounterContext,
    });

    const completion = await this.aiGateway.complete({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    });

    const validation = validateOutput(completion.content, prompt.retrievedChunkIds);

    if (!validation.valid || !validation.output) {
      this.logger.error(`Output validation failed: ${validation.errors.join(', ')}`);

      await this.prisma.aiInteraction.create({
        data: {
          encounterId,
          inputRedacted: piiResult.redacted,
          retrievedChunkIds: prompt.retrievedChunkIds,
          model: completion.model,
          rawOutput: {
            raw: completion.content,
            validationErrors: validation.errors,
          },
          uncertainty: true,
          uncertaintyReason: 'Output validation failed',
          latencyMs: Date.now() - start,
          cost: completion.usage.totalTokens * 0.00001,
        },
      });

      throw new BadRequestException({
        message: 'AI output validation failed',
        errors: validation.errors,
      });
    }

    const interaction = await this.prisma.aiInteraction.create({
      data: {
        encounterId,
        inputRedacted: piiResult.redacted,
        retrievedChunkIds: prompt.retrievedChunkIds,
        model: completion.model,
        rawOutput: validation.output,
        citations: { recommendations: validation.output.recommendations },
        uncertainty: validation.output.uncertainty,
        uncertaintyReason: validation.output.uncertaintyReason,
        latencyMs: Date.now() - start,
        cost: completion.usage.totalTokens * 0.00001,
      },
    });

    const citations = validation.output.recommendations.map((rec) => {
      const chunk = retrievalResult.chunks.find((c) => c.id === rec.citationChunkId);
      return {
        chunkId: rec.citationChunkId,
        source: chunk?.source ?? 'Unknown',
        sourceVersion: chunk?.sourceVersion ?? 'Unknown',
        text: chunk?.text ?? '',
      };
    });

    await this.encounters.update(physicianId, encounterId, {
      status: 'in_review',
    });

    return {
      interactionId: interaction.id,
      output: validation.output,
      citations,
      metadata: {
        piiDetected: piiResult.hasPII,
        injectionDetected: !injectionResult.safe,
        chunksRetrieved: retrievalResult.totalRetrieved,
        latencyMs: Date.now() - start,
        cost: completion.usage.totalTokens * 0.00001,
        model: completion.model,
      },
    };
  }
}
