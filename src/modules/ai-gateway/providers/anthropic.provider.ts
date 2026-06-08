import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
} from './provider.interface';

export interface ProviderOverrides {
  apiKey?: string;
  baseUrl?: string;
}

@Injectable()
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    overrides?: ProviderOverrides,
  ) {
    this.apiKey = overrides?.apiKey ?? this.config.getOrThrow<string>('AI_API_KEY');
    this.baseUrl =
      overrides?.baseUrl ?? this.config.get<string>('AI_BASE_URL', 'https://api.anthropic.com');
  }

  private buildMessageBody(params: CompletionParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      messages: params.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    };
    const systemMessage = params.messages.find((m) => m.role === 'system');
    if (systemMessage) body.system = systemMessage.content;
    return body;
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const start = Date.now();
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(this.buildMessageBody(params)),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Anthropic API error: ${response.status} ${errorText}`);
      throw new Error(`AI provider error: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const content = (data.content as Array<{ text: string }>).map((c) => c.text).join('');
    const usage = data.usage as { input_tokens: number; output_tokens: number };

    return {
      content,
      model: data.model as string,
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string> {
    const body = { ...this.buildMessageBody(params), stream: true };
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Anthropic stream error: ${response.status} ${errorText}`);
      throw new Error(`AI provider error: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const event = JSON.parse(data) as {
              type: string;
              delta?: { type: string; text: string };
            };
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              yield event.delta.text;
            }
          } catch {
            // skip malformed SSE data
          }
        }
      }
    } finally {
      reader.releaseLock();
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
}
