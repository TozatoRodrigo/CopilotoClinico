import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
} from './provider.interface';
import type { ProviderOverrides } from './anthropic.provider';

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    overrides?: ProviderOverrides,
  ) {
    this.apiKey = overrides?.apiKey ?? this.config.getOrThrow<string>('AI_API_KEY');
    this.baseUrl =
      overrides?.baseUrl ?? this.config.get<string>('AI_BASE_URL', 'https://api.openai.com');
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OpenAI API error: ${response.status} ${errorText}`);
      throw new Error(`AI provider error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      latencyMs: Date.now() - start,
    };
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string> {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OpenAI stream error: ${response.status} ${errorText}`);
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
              choices: Array<{ delta: { content?: string }; finish_reason: string | null }>;
            };
            const content = event.choices[0]?.delta?.content;
            if (content) yield content;
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
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ model: params.model, input: params.texts }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OpenAI embed error: ${response.status} ${errorText}`);
      throw new Error(`AI provider embed error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      model: string;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    return {
      embeddings: data.data.map((d) => d.embedding),
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}
