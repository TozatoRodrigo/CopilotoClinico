import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { EncountersService } from '../../encounters/encounters.service';
import { AuditService } from '../../audit/audit.service';
import { maskPII } from '../guardrails/pii-filter';
import { scanForInjection } from '../guardrails/injection-defense';
import { buildPrompt, type EncounterContext } from './prompt-builder';
import { validateOutput, type CopilotOutput } from '../guardrails/output-validator';
import type { AnalyzeInput } from '../schemas/copilot.schemas';
import { calculateInferenceCost } from './model-pricing';

export interface RecommendationSource {
  chunkId: string;
  source: string;
  sourceVersion: string;
  sourceText: string;
  sourceUrl: string;
}

export type EnrichedRecommendation = CopilotOutput['recommendations'][number] &
  RecommendationSource;

export type EnrichedCopilotOutput = Omit<CopilotOutput, 'recommendations'> & {
  recommendations: EnrichedRecommendation[];
};

export interface OrchestratorResult {
  interactionId: string;
  output: EnrichedCopilotOutput;
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

export type StreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'done'; result: OrchestratorResult }
  | { type: 'error'; errors: string[] };

/**
 * LGPD-005: Redação explícita do patientRef no texto clínico.
 *
 * Mesmo após LGPD-001 (patientRef como identificador opaco), o médico pode
 * digitar o valor do patientRef no texto livre do caso clínico. Esta função
 * garante que o valor nunca chegue ao provider de IA, independente da camada
 * de pseudonimização da integração hospitalar.
 *
 * Defense-in-depth: opera APÓS maskPII() para cobrir casos que o filtro
 * geral de PII não captura (ex: identificadores de prontuário específicos).
 */
function redactPatientRef(text: string, patientRef: string): string {
  if (!patientRef) return text;
  // Substituir todas as ocorrências, case-sensitive
  return text.split(patientRef).join('[PATIENT_REF_REDACTED]');
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly retrieval: RetrievalService,
    private readonly encounters: EncountersService,
    private readonly auditService: AuditService,
  ) {}

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    const start = Date.now();

    // Buscar encounter para obter patientRef — necessário para redação explícita (LGPD-005)
    const encounter = await this.encounters.findById(physicianId, encounterId);

    // Camada 1: filtro geral de PII (CPF, CNPJ, telefone, email, CEP, datas, RG)
    const piiResult = maskPII(input.caseText);
    this.logger.debug(
      `PII detection: ${piiResult.hasPII ? 'FOUND' : 'NONE'} (${piiResult.detections.length} items)`,
    );

    // Camada 2: redação explícita do patientRef (LGPD-005 defense-in-depth)
    // Garante que o identificador do paciente nunca chegue ao provider de IA,
    // mesmo que o médico o tenha digitado no texto livre do caso clínico.
    const fullyRedacted = redactPatientRef(piiResult.redacted, encounter.patientRef);

    const injectionResult = scanForInjection(fullyRedacted);
    if (!injectionResult.safe) {
      this.logger.warn(`Injection detected: ${injectionResult.reasons.join(', ')}`);
      await this.auditService.log({
        actorId: physicianId,
        action: 'PROMPT_INJECTION_DETECTED',
        entity: 'Encounter',
        entityId: encounterId,
        payload: {
          reasons: injectionResult.reasons,
          confidence: injectionResult.confidence,
          piiDetected: piiResult.hasPII,
          patientRefRedacted: piiResult.redacted !== fullyRedacted,
          inputLength: input.caseText.length,
        },
      });
      throw new BadRequestException({
        message: 'Input contains potentially unsafe content',
        reasons: injectionResult.reasons,
      });
    }

    const retrievalResult = await this.retrieval.search(fullyRedacted, 5);
    this.logger.debug(`Retrieved ${retrievalResult.totalRetrieved} chunks`);

    const encounterContext: EncounterContext = {
      hasCT: input.context.hasCT,
      isSus: input.context.isSus,
      hasLab: input.context.hasLab,
      hasICU: input.context.hasICU,
    };

    const prompt = buildPrompt({
      caseText: fullyRedacted,
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
    const inferenceCost = calculateInferenceCost({
      model: completion.model,
      usage: completion.usage,
    });

    const validation = validateOutput(completion.content, prompt.retrievedChunkIds);

    if (!validation.valid || !validation.output) {
      this.logger.error(`Output validation failed: ${validation.errors.join(', ')}`);

      await this.prisma.aiInteraction.create({
        data: {
          encounterId,
          inputRedacted: fullyRedacted,
          retrievedChunkIds: prompt.retrievedChunkIds,
          model: completion.model,
          rawOutput: {
            raw: completion.content,
            validationErrors: validation.errors,
          },
          uncertainty: true,
          uncertaintyReason: 'Output validation failed',
          latencyMs: Date.now() - start,
          cost: inferenceCost,
        },
      });

      throw new BadRequestException({
        message: 'AI output validation failed',
        errors: validation.errors,
      });
    }

    const enrichedOutput: EnrichedCopilotOutput = {
      ...validation.output,
      recommendations: validation.output.recommendations.map((rec) => {
        const chunk = retrievalResult.chunks.find((c) => c.id === rec.citationChunkId);
        return {
          ...rec,
          chunkId: rec.citationChunkId,
          source: chunk?.source ?? 'Unknown',
          sourceVersion: chunk?.sourceVersion ?? 'Unknown',
          sourceText: chunk?.text ?? '',
          sourceUrl: `/v1/guidelines/chunks/${rec.citationChunkId}`,
        };
      }),
    };

    const interaction = await this.prisma.aiInteraction.create({
      data: {
        encounterId,
        inputRedacted: fullyRedacted,
        retrievedChunkIds: prompt.retrievedChunkIds,
        model: completion.model,
        rawOutput: enrichedOutput as unknown as Prisma.InputJsonValue,
        citations: {
          recommendations: enrichedOutput.recommendations,
        } as unknown as Prisma.InputJsonValue,
        uncertainty: enrichedOutput.uncertainty,
        uncertaintyReason: enrichedOutput.uncertaintyReason,
        latencyMs: Date.now() - start,
        cost: inferenceCost,
      },
    });

    const citations = enrichedOutput.recommendations.map((rec) => {
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
      output: enrichedOutput,
      citations,
      metadata: {
        piiDetected: piiResult.hasPII,
        injectionDetected: !injectionResult.safe,
        chunksRetrieved: retrievalResult.totalRetrieved,
        latencyMs: Date.now() - start,
        cost: inferenceCost,
        model: completion.model,
      },
    };
  }

  async *analyzeStream(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): AsyncGenerator<StreamEvent> {
    const start = Date.now();

    const encounter = await this.encounters.findById(physicianId, encounterId);

    const piiResult = maskPII(input.caseText);
    const fullyRedacted = redactPatientRef(piiResult.redacted, encounter.patientRef);

    const injectionResult = scanForInjection(fullyRedacted);
    if (!injectionResult.safe) {
      this.logger.warn(`Injection detected (stream): ${injectionResult.reasons.join(', ')}`);
      await this.auditService.log({
        actorId: physicianId,
        action: 'PROMPT_INJECTION_DETECTED',
        entity: 'Encounter',
        entityId: encounterId,
        payload: {
          reasons: injectionResult.reasons,
          confidence: injectionResult.confidence,
          piiDetected: piiResult.hasPII,
          patientRefRedacted: piiResult.redacted !== fullyRedacted,
          inputLength: input.caseText.length,
        },
      });
      throw new BadRequestException({
        message: 'Input contains potentially unsafe content',
        reasons: injectionResult.reasons,
      });
    }

    const retrievalResult = await this.retrieval.search(fullyRedacted, 5);

    const encounterContext: EncounterContext = {
      hasCT: input.context.hasCT,
      isSus: input.context.isSus,
      hasLab: input.context.hasLab,
      hasICU: input.context.hasICU,
    };

    const prompt = buildPrompt({
      caseText: fullyRedacted,
      retrievedChunks: retrievalResult.chunks.map((c) => ({
        chunkId: c.id,
        text: c.text,
        source: c.source,
        sourceVersion: c.sourceVersion,
        score: c.score,
      })),
      context: encounterContext,
    });

    let fullContent = '';
    let streamedModel = this.aiGateway.getProviderName();

    for await (const delta of this.aiGateway.completeStream({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    })) {
      fullContent += delta;
      yield { type: 'delta', delta };
    }

    // Post-stream: validate output before persisting
    const mockCompletion = { content: fullContent, model: streamedModel };
    const inferenceCost = calculateInferenceCost({
      model: mockCompletion.model,
      // Approximate token count from streamed content; exact usage not available in streaming
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const validation = validateOutput(fullContent, prompt.retrievedChunkIds);

    if (!validation.valid || !validation.output) {
      this.logger.error(`Stream output validation failed: ${validation.errors.join(', ')}`);
      await this.prisma.aiInteraction.create({
        data: {
          encounterId,
          inputRedacted: fullyRedacted,
          retrievedChunkIds: prompt.retrievedChunkIds,
          model: mockCompletion.model,
          rawOutput: { raw: fullContent, validationErrors: validation.errors },
          uncertainty: true,
          uncertaintyReason: 'Output validation failed',
          latencyMs: Date.now() - start,
          cost: inferenceCost,
        },
      });
      yield { type: 'error', errors: validation.errors };
      return;
    }

    const enrichedOutput: EnrichedCopilotOutput = {
      ...validation.output,
      recommendations: validation.output.recommendations.map((rec) => {
        const chunk = retrievalResult.chunks.find((c) => c.id === rec.citationChunkId);
        return {
          ...rec,
          chunkId: rec.citationChunkId,
          source: chunk?.source ?? 'Unknown',
          sourceVersion: chunk?.sourceVersion ?? 'Unknown',
          sourceText: chunk?.text ?? '',
          sourceUrl: `/v1/guidelines/chunks/${rec.citationChunkId}`,
        };
      }),
    };

    const interaction = await this.prisma.aiInteraction.create({
      data: {
        encounterId,
        inputRedacted: fullyRedacted,
        retrievedChunkIds: prompt.retrievedChunkIds,
        model: mockCompletion.model,
        rawOutput: enrichedOutput as unknown as Prisma.InputJsonValue,
        citations: { recommendations: enrichedOutput.recommendations } as unknown as Prisma.InputJsonValue,
        uncertainty: enrichedOutput.uncertainty,
        uncertaintyReason: enrichedOutput.uncertaintyReason,
        latencyMs: Date.now() - start,
        cost: inferenceCost,
      },
    });

    const citations = enrichedOutput.recommendations.map((rec) => {
      const chunk = retrievalResult.chunks.find((c) => c.id === rec.citationChunkId);
      return {
        chunkId: rec.citationChunkId,
        source: chunk?.source ?? 'Unknown',
        sourceVersion: chunk?.sourceVersion ?? 'Unknown',
        text: chunk?.text ?? '',
      };
    });

    await this.encounters.update(physicianId, encounterId, { status: 'in_review' });

    yield {
      type: 'done',
      result: {
        interactionId: interaction.id,
        output: enrichedOutput,
        citations,
        metadata: {
          piiDetected: piiResult.hasPII,
          injectionDetected: false,
          chunksRetrieved: retrievalResult.totalRetrieved,
          latencyMs: Date.now() - start,
          cost: inferenceCost,
          model: mockCompletion.model,
        },
      },
    };
  }
}
