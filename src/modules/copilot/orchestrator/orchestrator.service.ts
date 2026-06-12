import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
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
import type { AnalyzeInput, RespondInput } from '../schemas/copilot.schemas';
import { calculateInferenceCost } from './model-pricing';

const DEFAULT_MAX_TURNS = 5;
const RECOMMENDATION_CATEGORY_ORDER = {
  stabilization: 0,
  diagnostic: 1,
  therapeutic: 2,
  verify: 3,
} as const;

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
    institutionId: string | null;
    origin: 'institutional' | 'public';
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

export interface AnsweredQuestion {
  questionId: string;
  question: string;
  answer: string;
  turnIndex: number;
}

function sortRecommendations<T extends CopilotOutput['recommendations'][number]>(
  recommendations: T[],
): T[] {
  return [...recommendations].sort((left, right) => {
    const categoryDelta =
      RECOMMENDATION_CATEGORY_ORDER[left.category] - RECOMMENDATION_CATEGORY_ORDER[right.category];
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    return right.confidence - left.confidence;
  });
}

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
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(RetrievalService) private readonly retrieval: RetrievalService,
    @Inject(EncountersService) private readonly encounters: EncountersService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
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

    const retrievalResult = await this.retrieval.search(fullyRedacted, 5, encounter.institutionId);
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
      recommendations: sortRecommendations(validation.output.recommendations).map((rec) => {
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
        institutionId: chunk?.institutionId ?? null,
        origin: (chunk?.institutionId ? 'institutional' : 'public') as 'institutional' | 'public',
      };
    });

    await this.encounters.update(physicianId, encounterId, {
      status: 'in_review',
    });

    await this.logQuestionsEmittedIfAny(
      physicianId,
      encounterId,
      interaction.id,
      0,
      enrichedOutput.clarifyingQuestions,
    );

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

  /**
   * DEC-005: registra COPILOT_QUESTIONS_EMITTED na cadeia de auditoria
   * sempre que a análise (inicial ou de um turno subsequente) gera novas
   * perguntas de esclarecimento para o médico.
   */
  private async logQuestionsEmittedIfAny(
    physicianId: string,
    encounterId: string,
    interactionId: string,
    turnIndex: number,
    questions: EnrichedCopilotOutput['clarifyingQuestions'],
  ): Promise<void> {
    if (!questions?.length) return;

    await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_QUESTIONS_EMITTED',
      entity: 'Encounter',
      entityId: encounterId,
      payload: {
        interactionId,
        turnIndex,
        questionIds: questions.map((q) => q.id),
      },
    });
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

    const retrievalResult = await this.retrieval.search(fullyRedacted, 5, encounter.institutionId);

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
      recommendations: sortRecommendations(validation.output.recommendations).map((rec) => {
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
        institutionId: chunk?.institutionId ?? null,
        origin: (chunk?.institutionId ? 'institutional' : 'public') as 'institutional' | 'public',
      };
    });

    await this.encounters.update(physicianId, encounterId, { status: 'in_review' });

    await this.logQuestionsEmittedIfAny(
      physicianId,
      encounterId,
      interaction.id,
      0,
      enrichedOutput.clarifyingQuestions,
    );

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

  async continueAnalysis(
    physicianId: string,
    encounterId: string,
    input: RespondInput,
  ): Promise<OrchestratorResult> {
    const start = Date.now();

    const encounter = await this.encounters.findById(physicianId, encounterId);

    const parentInteraction = await this.prisma.aiInteraction.findFirst({
      where: { id: input.interactionId, encounterId },
    });
    if (!parentInteraction) {
      throw new NotFoundException('Interaction not found');
    }

    const maxTurns = this.config.get<number>('COPILOT_MAX_TURNS', DEFAULT_MAX_TURNS);
    const newTurnIndex = parentInteraction.turnIndex + 1;
    if (newTurnIndex >= maxTurns) {
      throw new BadRequestException({
        message: `Maximum number of conversation turns (${maxTurns}) reached for this encounter`,
      });
    }
    const forceFinal = newTurnIndex === maxTurns - 1;

    const parentOutput = parentInteraction.rawOutput as unknown as EnrichedCopilotOutput;
    const clarifyingQuestions = parentOutput.clarifyingQuestions ?? [];

    // Camada 1+2: PII mask + redação patientRef nas respostas do médico (LGPD-005)
    const piiResults = input.answers.map((a) => maskPII(String(a.answer)));
    const piiDetected = piiResults.some((r) => r.hasPII);
    const redactedAnswers = piiResults.map((r) =>
      redactPatientRef(r.redacted, encounter.patientRef),
    );

    const injectionResult = scanForInjection(redactedAnswers.join('\n'));
    if (!injectionResult.safe) {
      this.logger.warn(`Injection detected (respond): ${injectionResult.reasons.join(', ')}`);
      await this.auditService.log({
        actorId: physicianId,
        action: 'PROMPT_INJECTION_DETECTED',
        entity: 'Encounter',
        entityId: encounterId,
        payload: {
          reasons: injectionResult.reasons,
          confidence: injectionResult.confidence,
          piiDetected,
          patientRefRedacted:
            piiResults.map((r) => r.redacted).join('\n') !== redactedAnswers.join('\n'),
          inputLength: input.answers.reduce((sum, a) => sum + String(a.answer).length, 0),
        },
      });
      throw new BadRequestException({
        message: 'Input contains potentially unsafe content',
        reasons: injectionResult.reasons,
      });
    }

    // DEC-005: registra a submissão de respostas do médico na cadeia de
    // auditoria. Por minimização de dados (LGPD), o conteúdo das respostas
    // nunca é gravado em texto claro — apenas seu hash SHA-256.
    await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_QUESTION_ANSWERED',
      entity: 'Encounter',
      entityId: encounterId,
      payload: {
        interactionId: parentInteraction.id,
        turnIndex: newTurnIndex,
        questionIds: input.answers.map((a) => a.questionId),
        answersHash: createHash('sha256').update(JSON.stringify(input.answers)).digest('hex'),
      },
    });

    const newAnswers: AnsweredQuestion[] = input.answers.map((a, index) => {
      const question = clarifyingQuestions.find((q) => q.id === a.questionId);
      return {
        questionId: a.questionId,
        question: question?.question ?? a.questionId,
        answer: redactedAnswers[index] ?? '',
        turnIndex: parentInteraction.turnIndex,
      };
    });

    const previousAnswers =
      (parentInteraction.answeredQuestions as unknown as AnsweredQuestion[] | null) ?? [];
    const allAnsweredQuestions = [...previousAnswers, ...newAnswers];

    const qaBlock = allAnsweredQuestions
      .map((qa) => `P: ${qa.question}\nR: ${qa.answer}`)
      .join('\n\n');

    const baseCaseText = parentInteraction.inputRedacted ?? '';
    const augmentedCaseText = `${baseCaseText}\n\n--- Informações adicionais fornecidas pelo médico ---\n${qaBlock}`;

    const retrievalResult = await this.retrieval.search(
      augmentedCaseText,
      5,
      encounter.institutionId,
    );
    this.logger.debug(`Retrieved ${retrievalResult.totalRetrieved} chunks (respond)`);

    const encounterContext = (encounter.context as unknown as EncounterContext | null) ?? {
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: false,
    };

    const prompt = buildPrompt({
      caseText: augmentedCaseText,
      retrievedChunks: retrievalResult.chunks.map((c) => ({
        chunkId: c.id,
        text: c.text,
        source: c.source,
        sourceVersion: c.sourceVersion,
        score: c.score,
      })),
      context: encounterContext,
      additionalInstructions: forceFinal
        ? 'Este é o último turno permitido para esta análise. NÃO inclua novas clarifyingQuestions (a lista deve ficar vazia). Forneça recomendações finais com base nas informações disponíveis; se ainda houver incerteza, defina uncertainty=true e descreva uncertaintyReason, mas inclua recomendações preliminares quando possível.'
        : undefined,
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
      this.logger.error(`Output validation failed (respond): ${validation.errors.join(', ')}`);

      await this.prisma.aiInteraction.create({
        data: {
          encounterId,
          inputRedacted: baseCaseText,
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
          turnIndex: newTurnIndex,
          parentInteractionId: parentInteraction.id,
          answeredQuestions: allAnsweredQuestions as unknown as Prisma.InputJsonValue,
        },
      });

      throw new BadRequestException({
        message: 'AI output validation failed',
        errors: validation.errors,
      });
    }

    const enrichedOutput: EnrichedCopilotOutput = {
      ...validation.output,
      recommendations: sortRecommendations(validation.output.recommendations).map((rec) => {
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
        inputRedacted: baseCaseText,
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
        turnIndex: newTurnIndex,
        parentInteractionId: parentInteraction.id,
        answeredQuestions: allAnsweredQuestions as unknown as Prisma.InputJsonValue,
      },
    });

    const citations = enrichedOutput.recommendations.map((rec) => {
      const chunk = retrievalResult.chunks.find((c) => c.id === rec.citationChunkId);
      return {
        chunkId: rec.citationChunkId,
        source: chunk?.source ?? 'Unknown',
        sourceVersion: chunk?.sourceVersion ?? 'Unknown',
        text: chunk?.text ?? '',
        institutionId: chunk?.institutionId ?? null,
        origin: (chunk?.institutionId ? 'institutional' : 'public') as 'institutional' | 'public',
      };
    });

    await this.encounters.update(physicianId, encounterId, {
      status: 'in_review',
    });

    await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_ANALYSIS_REFINED',
      entity: 'Encounter',
      entityId: encounterId,
      payload: {
        interactionId: interaction.id,
        parentInteractionId: parentInteraction.id,
        turnIndex: newTurnIndex,
        uncertainty: enrichedOutput.uncertainty,
        cost: inferenceCost,
      },
    });

    await this.logQuestionsEmittedIfAny(
      physicianId,
      encounterId,
      interaction.id,
      newTurnIndex,
      enrichedOutput.clarifyingQuestions,
    );

    return {
      interactionId: interaction.id,
      output: enrichedOutput,
      citations,
      metadata: {
        piiDetected,
        injectionDetected: !injectionResult.safe,
        chunksRetrieved: retrievalResult.totalRetrieved,
        latencyMs: Date.now() - start,
        cost: inferenceCost,
        model: completion.model,
      },
    };
  }
}
