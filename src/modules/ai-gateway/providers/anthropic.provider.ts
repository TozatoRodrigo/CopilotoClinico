import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaFallbackBlock,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaOutputConfig,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { AiRefusalError, AiTruncatedError } from '../ai-gateway.errors';
import { readChoice, readMaxOutputTokens } from '../ai-gateway.settings';
import { claudeCapabilities } from './claude-models';
import {
  AI_EFFORTS,
  type AIProvider,
  type AiEffort,
  type ChatMessage,
  type CompletionParams,
  type CompletionResponse,
  type CompletionUsage,
  type EmbeddingParams,
  type EmbeddingResponse,
  type ProviderOverrides,
  type StreamCompletionResult,
} from './provider.interface';

const REFUSAL_FALLBACK_MODES = ['default', 'off'] as const;
const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// Valor que produção sempre mandou aos modelos legados (ex.: claude-sonnet-4-20250514).
const LEGACY_DEFAULT_TEMPERATURE = 0.3;

type ConversationMessage = ChatMessage & BetaMessageParam;

function isConversationMessage(message: ChatMessage): message is ConversationMessage {
  return message.role !== 'system';
}

function isFallbackBlock(block: BetaContentBlock): block is BetaFallbackBlock {
  return block.type === 'fallback';
}

/**
 * Só o texto depois do último bloco `fallback`: antes dele está o trecho
 * parcial do modelo que recusou (shared/model-migration.md § refusal).
 * Blocos de thinking são ignorados.
 */
function finalText(content: BetaContentBlock[]): string {
  const lastFallbackIndex = content.reduce(
    (lastIndex, block, index) => (isFallbackBlock(block) ? index : lastIndex),
    -1,
  );
  return content
    .slice(lastFallbackIndex + 1)
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
}

function toCompletionUsage(usage: BetaUsage): CompletionUsage {
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cacheReadTokens + cacheWriteTokens;
  return {
    promptTokens,
    completionTokens: usage.output_tokens,
    totalTokens: promptTokens + usage.output_tokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

@Injectable()
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;
  private readonly defaultEffort: AiEffort;
  private readonly defaultMaxTokens: number;
  private readonly refusalFallbackEnabled: boolean;

  constructor(config: ConfigService, overrides?: ProviderOverrides) {
    this.client = new Anthropic({
      apiKey: overrides?.apiKey ?? config.getOrThrow<string>('AI_API_KEY'),
      // Vazio (compose `${AI_BASE_URL:-}`) cai no padrão do SDK: api.anthropic.com.
      baseURL: overrides?.baseUrl || config.get<string>('AI_BASE_URL') || undefined,
    });
    this.defaultEffort = readChoice(config, 'AI_EFFORT', AI_EFFORTS, 'high');
    this.defaultMaxTokens = readMaxOutputTokens(config);
    this.refusalFallbackEnabled =
      readChoice(config, 'AI_REFUSAL_FALLBACK', REFUSAL_FALLBACK_MODES, 'default') === 'default';
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const start = Date.now();
    const request = this.buildRequest(params);
    // Stream por baixo mesmo sem consumir os deltas: com thinking e max_tokens
    // altos, uma requisição sem stream arrisca o timeout HTTP do SDK.
    const message = await this.logApiErrors(() =>
      this.client.beta.messages.stream(request).finalMessage(),
    );
    const { content, model, usage } = this.toResult(message, request);
    return { content, model, usage, latencyMs: Date.now() - start };
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string, StreamCompletionResult> {
    const request = this.buildRequest(params);
    const stream = this.client.beta.messages.stream(request);
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
      return this.toResult(await stream.finalMessage(), request);
    } catch (error) {
      this.logApiError(error);
      throw error;
    }
  }

  async embed(params: EmbeddingParams): Promise<EmbeddingResponse> {
    // Anthropic does not provide an embeddings API. This provider should not be
    // used for embeddings — configure EMBEDDING_PROVIDER=openai instead.
    throw new Error(
      `AnthropicProvider does not support embeddings. ` +
        `Set EMBEDDING_PROVIDER=openai and EMBEDDING_API_KEY to use a separate embedding provider. ` +
        `Requested model: ${params.model}`,
    );
  }

  private buildRequest(params: CompletionParams): BetaMessageStreamParams {
    const capabilities = claudeCapabilities(params.model);
    const system = params.messages.find((message) => message.role === 'system')?.content;
    const outputConfig: BetaOutputConfig = {
      ...(capabilities.adaptiveThinking && { effort: params.effort ?? this.defaultEffort }),
      ...(capabilities.structuredOutputs &&
        params.responseSchema && {
          format: { type: 'json_schema', schema: params.responseSchema.schema },
        }),
    };
    const useRefusalFallback = capabilities.refusalFallback && this.refusalFallbackEnabled;

    this.logger.debug(
      `Anthropic request: model=${params.model} adaptiveThinking=${capabilities.adaptiveThinking} ` +
        `effort=${outputConfig.effort ?? '-'} structuredOutput=${outputConfig.format !== undefined} ` +
        `refusalFallback=${useRefusalFallback}`,
    );

    return {
      model: params.model,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens,
      messages: params.messages
        .filter(isConversationMessage)
        .map(({ role, content }) => ({ role, content })),
      // O system prompt é grande e estável entre análises: cachear o prefixo
      // corta o custo de entrada a partir da segunda chamada na janela de 5 min.
      ...(system && {
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      }),
      // Modelos atuais rejeitam temperature/top_p/top_k com 400.
      ...(capabilities.adaptiveThinking
        ? { thinking: { type: 'adaptive' } }
        : { temperature: params.temperature ?? LEGACY_DEFAULT_TEMPERATURE }),
      ...(Object.keys(outputConfig).length > 0 && { output_config: outputConfig }),
      ...(useRefusalFallback && { fallbacks: 'default', betas: [REFUSAL_FALLBACK_BETA] }),
    };
  }

  private toResult(message: BetaMessage, request: BetaMessageStreamParams): StreamCompletionResult {
    const usage = toCompletionUsage(message.usage);
    this.logFallbackServed(message, request.model);

    if (message.stop_reason === 'refusal') {
      const category = message.stop_details?.category ?? null;
      this.logger.warn(`AI_REFUSAL model=${message.model} category=${category ?? 'unspecified'}`);
      throw new AiRefusalError({
        model: message.model,
        category,
        explanation: message.stop_details?.explanation ?? null,
        usage,
      });
    }

    if (message.stop_reason === 'max_tokens') {
      this.logger.warn(
        `AI_OUTPUT_TRUNCATED model=${message.model} maxTokens=${request.max_tokens} ` +
          `outputTokens=${usage.completionTokens}`,
      );
      throw new AiTruncatedError({ model: message.model, maxTokens: request.max_tokens, usage });
    }

    return {
      content: finalText(message.content),
      model: message.model,
      usage,
      stopReason: message.stop_reason,
    };
  }

  /**
   * Um `fallback_message` em `usage.iterations` é o sinal de que outro modelo
   * serviu a resposta — inclusive em turnos "sticky", que não trazem bloco
   * `fallback` no conteúdo.
   */
  private logFallbackServed(message: BetaMessage, requestedModel: string): void {
    const servedByFallback = (message.usage.iterations ?? []).some(
      (iteration) => iteration.type === 'fallback_message',
    );
    if (!servedByFallback || message.stop_reason === 'refusal') return;

    const declinedBy = message.content
      .filter(isFallbackBlock)
      .map((block) => `${block.from.model}:${block.trigger.category ?? 'unspecified'}`);
    this.logger.warn(
      `AI_REFUSAL_FALLBACK requested=${requestedModel} servedBy=${message.model} ` +
        `declined=${declinedBy.join(',') || 'sticky'}`,
    );
  }

  private async logApiErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logApiError(error);
      throw error;
    }
  }

  private logApiError(error: unknown): void {
    if (!(error instanceof Anthropic.APIError)) return;
    this.logger.error(
      `Anthropic API error: status=${error.status ?? 'connection'} type=${error.type ?? '-'} ` +
        `requestId=${error.requestID ?? '-'} message=${error.message}`,
    );
  }
}
