import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiRefusalError, AiTruncatedError } from '../../src/modules/ai-gateway/ai-gateway.errors';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type {
  ChatMessage,
  CompletionParams,
  CompletionResponse,
  CompletionUsage,
} from '../../src/modules/ai-gateway/providers/provider.interface';

/** Motivo de parada que o gabarito precisa distinguir; `null` = parada normal. */
export type RecordedStopReason = 'max_tokens' | 'refusal' | null;

/**
 * F0-A — Uma chamada de completion feita pelo pipeline durante um caso:
 * prompt completo, resposta crua, modelo servido, motivo de parada e tokens.
 * É o que permite explicar uma nota sem rodar o caso de novo.
 */
export interface RecordedCompletion {
  messages: ChatMessage[];
  requestedModel: string;
  servedModel: string | null;
  content: string | null;
  stopReason: RecordedStopReason;
  /** Categoria da política que recusou (`cyber`, `bio`...), quando houve recusa. */
  refusalCategory: string | null;
  usage: CompletionUsage | null;
  latencyMs: number;
  error: string | null;
}

/**
 * Atribui cada completion ao caso que a disparou, mesmo com casos rodando em
 * paralelo no mesmo contexto Nest (AsyncLocalStorage segue o fluxo async do
 * caso por dentro do orquestrador).
 */
export class CompletionRecorder {
  private readonly storage = new AsyncLocalStorage<RecordedCompletion[]>();

  run<T>(sink: RecordedCompletion[], task: () => Promise<T>): Promise<T> {
    return this.storage.run(sink, task);
  }

  record(completion: RecordedCompletion): void {
    this.storage.getStore()?.push(completion);
  }
}

/**
 * Truncamento e recusa não voltam como resposta: o gateway LANÇA
 * AiTruncatedError/AiRefusalError, com modelo e tokens em `details`. A
 * chamada é gravada com esses dados — ela custou tokens e é a causa do
 * "sem resposta" — e o erro segue para o orquestrador como em produção.
 */
function failedCompletion(
  error: unknown,
): Omit<RecordedCompletion, 'messages' | 'requestedModel' | 'latencyMs'> {
  const base = { content: null, error: error instanceof Error ? error.message : String(error) };
  if (error instanceof AiTruncatedError) {
    return {
      ...base,
      servedModel: error.details.model,
      stopReason: 'max_tokens',
      refusalCategory: null,
      usage: error.details.usage,
    };
  }
  if (error instanceof AiRefusalError) {
    return {
      ...base,
      servedModel: error.details.model,
      stopReason: 'refusal',
      refusalCategory: error.details.category,
      usage: error.details.usage,
    };
  }
  return { ...base, servedModel: null, stopReason: null, refusalCategory: null, usage: null };
}

/**
 * O AiGatewayService REAL, com uma escuta: chama o provedor exatamente como
 * em produção (super.complete) e só anota o que entrou e saiu. Não é uma
 * reimplementação da chamada.
 */
@Injectable()
export class RecordingAiGatewayService extends AiGatewayService {
  private readonly configuredModel: string;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(CompletionRecorder) private readonly recorder: CompletionRecorder,
  ) {
    super(configService);
    this.configuredModel = configService.getOrThrow<string>('AI_MODEL');
  }

  override async complete(
    params: Omit<CompletionParams, 'model'> & { model?: string },
  ): Promise<CompletionResponse> {
    const call = {
      messages: params.messages,
      requestedModel: params.model ?? this.configuredModel,
    };
    const startedAt = Date.now();
    try {
      const response = await super.complete(params);
      this.recorder.record({
        ...call,
        servedModel: response.model,
        content: response.content,
        stopReason: null,
        refusalCategory: null,
        usage: response.usage,
        latencyMs: response.latencyMs,
        error: null,
      });
      return response;
    } catch (error) {
      this.recorder.record({
        ...call,
        ...failedCompletion(error),
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
