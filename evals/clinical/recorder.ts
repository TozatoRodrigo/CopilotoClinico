import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import type {
  ChatMessage,
  CompletionParams,
  CompletionResponse,
} from '../../src/modules/ai-gateway/providers/provider.interface';

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
  stopReason: string | null;
  usage: CompletionResponse['usage'] | null;
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
    const requestedModel = params.model ?? this.configuredModel;
    const startedAt = Date.now();
    try {
      const response = await super.complete(params);
      this.recorder.record({
        messages: params.messages,
        requestedModel,
        servedModel: response.model,
        content: response.content,
        stopReason: response.stopReason ?? null,
        usage: response.usage,
        latencyMs: response.latencyMs,
        error: null,
      });
      return response;
    } catch (error) {
      this.recorder.record({
        messages: params.messages,
        requestedModel,
        servedModel: null,
        content: null,
        stopReason: null,
        usage: null,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
