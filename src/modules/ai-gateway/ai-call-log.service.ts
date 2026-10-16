import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { currentRequestContext } from '../../shared/request-context/request-context';
import { calculateInferenceCost } from '../copilot/orchestrator/model-pricing';
import type { AiCallSink, AiCallTrace } from './ai-call-trace';

/**
 * Guarda o rastro de cada chamada de IA em ai_calls e numa linha `AI_CALL` do
 * log, com o requestId da requisição. Fora do caminho da análise: a gravação
 * não é esperada e a falha só vira aviso.
 */
@Injectable()
export class AiCallLogService implements AiCallSink {
  private readonly logger = new Logger('AiCallLog');

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  record(trace: AiCallTrace): void {
    const context = currentRequestContext();
    const pricedModel = trace.servedModel ?? trace.requestedModel;
    const costUsd = trace.usage
      ? calculateInferenceCost({ model: pricedModel, usage: trace.usage })
      : null;

    this.logger.log(
      `AI_CALL stage=${trace.stage} profile=${trace.profile} model=${trace.servedModel ?? trace.requestedModel} ` +
        `outcome=${trace.outcome} latencyMs=${trace.latencyMs} costUsd=${costUsd ?? '-'} ` +
        `prompt=${trace.promptSha256.slice(0, 12)} fallbackFrom=${trace.fallbackFrom ?? '-'} ` +
        `requestId=${context?.requestId ?? '-'}`,
    );

    void this.prisma.aiCall
      .create({
        data: {
          requestId: context?.requestId ?? null,
          physicianId: context?.physicianId ?? null,
          encounterId: context?.encounterId ?? null,
          stage: trace.stage,
          profile: trace.profile,
          provider: trace.provider,
          requestedModel: trace.requestedModel,
          servedModel: trace.servedModel,
          effort: trace.effort,
          promptSha256: trace.promptSha256,
          responseSchema: trace.responseSchema,
          promptTokens: trace.usage?.promptTokens ?? null,
          completionTokens: trace.usage?.completionTokens ?? null,
          cacheReadTokens: trace.usage?.cacheReadTokens ?? null,
          cacheWriteTokens: trace.usage?.cacheWriteTokens ?? null,
          costUsd,
          latencyMs: trace.latencyMs,
          outcome: trace.outcome,
          errorType: trace.errorType,
          fallbackFrom: trace.fallbackFrom,
        },
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.name : 'unknown';
        this.logger.warn(`AI_CALL_LOG_FAILED stage=${trace.stage} reason=${reason}`);
      });
  }
}
