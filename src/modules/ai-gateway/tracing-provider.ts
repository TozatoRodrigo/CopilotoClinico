import { createHash } from 'node:crypto';
import { AiRefusalError, AiTruncatedError, errorTypeOf } from './ai-gateway.errors';
import type { AiCallOutcome, AiCallSink, AiCallStage, AiCallTrace } from './ai-call-trace';
import type {
  AIProvider,
  ChatMessage,
  CompletionParams,
  CompletionResponse,
  CompletionUsage,
  EmbeddingParams,
  EmbeddingResponse,
  ResearchParams,
  ResearchResponse,
  StreamCompletionResult,
} from './providers/provider.interface';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function systemPromptOf(messages: ChatMessage[]): string {
  return messages
    .filter(({ role }) => role === 'system')
    .map(({ content }) => content)
    .join('\n');
}

interface Failure {
  outcome: AiCallOutcome;
  servedModel: string | null;
  usage: CompletionUsage | null;
  errorType: string | null;
}

function failureOf(error: unknown): Failure {
  if (error instanceof AiRefusalError) {
    return {
      outcome: 'refusal',
      servedModel: error.details.model,
      usage: error.details.usage,
      errorType: null,
    };
  }
  if (error instanceof AiTruncatedError) {
    return {
      outcome: 'truncated',
      servedModel: error.details.model,
      usage: error.details.usage,
      errorType: null,
    };
  }
  return { outcome: 'error', servedModel: null, usage: null, errorType: errorTypeOf(error) };
}

/**
 * Envolve um provedor e entrega ao `sink` o rastro de cada chamada, com ou
 * sem sucesso. O rastro nunca derruba nem atrasa a chamada.
 */
export class TracingAiProvider implements AIProvider {
  constructor(
    private readonly inner: AIProvider,
    private readonly profile: string,
    private readonly sink: AiCallSink,
  ) {}

  get name(): string {
    return this.inner.name;
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.inner.complete(params);
      this.record(params, startedAt, {
        outcome: 'ok',
        servedModel: response.model,
        usage: response.usage,
        errorType: null,
      });
      return response;
    } catch (error) {
      this.record(params, startedAt, failureOf(error));
      throw error;
    }
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string, StreamCompletionResult> {
    const startedAt = Date.now();
    let settled = false;
    try {
      const result = yield* this.inner.completeStream(params);
      settled = true;
      this.record(params, startedAt, {
        outcome: 'ok',
        servedModel: result.model,
        usage: result.usage,
        errorType: null,
      });
      return result;
    } catch (error) {
      settled = true;
      this.record(params, startedAt, failureOf(error));
      throw error;
    } finally {
      // Quem consumia saiu no meio (o médico fechou a tela): o modelo parou.
      if (!settled) {
        this.record(params, startedAt, {
          outcome: 'aborted',
          servedModel: null,
          usage: null,
          errorType: null,
        });
      }
    }
  }

  embed(params: EmbeddingParams): Promise<EmbeddingResponse> {
    return this.inner.embed(params);
  }

  async research(params: ResearchParams): Promise<ResearchResponse> {
    const startedAt = Date.now();
    const call = {
      stage: params.stage ?? 'research',
      model: params.model,
      effort: params.effort,
      systemPrompt: params.system,
      responseSchema: null,
      fallbackFrom: null,
    };
    try {
      const response = await this.inner.research(params);
      this.emit(call, startedAt, {
        outcome: 'ok',
        servedModel: response.model,
        usage: response.usage,
        errorType: null,
      });
      return response;
    } catch (error) {
      this.emit(call, startedAt, failureOf(error));
      throw error;
    }
  }

  private record(params: CompletionParams, startedAt: number, failure: Failure): void {
    this.emit(
      {
        stage: params.stage ?? 'other',
        model: params.model,
        effort: params.effort,
        systemPrompt: systemPromptOf(params.messages),
        responseSchema: params.responseSchema?.name ?? null,
        fallbackFrom: params.fallbackFrom ?? null,
      },
      startedAt,
      failure,
    );
  }

  private emit(
    call: {
      stage: AiCallStage;
      model: string;
      effort: CompletionParams['effort'];
      systemPrompt: string;
      responseSchema: string | null;
      fallbackFrom: string | null;
    },
    startedAt: number,
    result: Failure,
  ): void {
    const trace: AiCallTrace = {
      stage: call.stage,
      profile: this.profile,
      provider: this.inner.name,
      requestedModel: call.model,
      servedModel: result.servedModel,
      effort: call.effort ?? null,
      promptSha256: sha256(call.systemPrompt),
      responseSchema: call.responseSchema,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      outcome: result.outcome,
      errorType: result.errorType,
      fallbackFrom: call.fallbackFrom,
    };
    try {
      this.sink.record(trace);
    } catch {
      // o rastro é acessório: a análise segue
    }
  }
}
