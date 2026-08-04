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

// OpenAI's reasoning-style model families (o1/o3, gpt-5.x) reject any
// `temperature` other than the implicit default (1) — the param must be
// omitted entirely rather than sent as 1, since some of these models reject
// the key being present at all.
function acceptsCustomTemperature(model: string): boolean {
  return !/^(o1|o3|gpt-5)/i.test(model);
}

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
    this.apiKey = overrides?.apiKey || this.config.getOrThrow<string>('AI_API_KEY');
    // baseUrl carries the full versioned prefix (e.g. "https://api.openai.com/v1" or
    // Z.ai's "https://api.z.ai/api/paas/v4") — providers version their REST paths
    // differently, so the version segment can't be hardcoded below. This class serves
    // both the completion and embedding provider slots (each with its own AI_BASE_URL /
    // EMBEDDING_BASE_URL passed in as `overrides` by AiGatewayService), so it must not
    // read either config key itself — only the caller knows which one applies, and an
    // empty-but-set env var (common with compose `${VAR:-}` passthroughs) must fall
    // through to the default exactly like an unset one, hence `||` rather than `??`.
    this.baseUrl = overrides?.baseUrl || 'https://api.openai.com/v1';
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
      // Newer models (gpt-5.x, o1/o3 reasoning family) reject `max_tokens` outright
      // and require `max_completion_tokens` instead.
      max_completion_tokens: params.maxTokens ?? 4096,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (acceptsCustomTemperature(params.model)) {
      body.temperature = params.temperature ?? 0.3;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
      // Newer models (gpt-5.x, o1/o3 reasoning family) reject `max_tokens` outright
      // and require `max_completion_tokens` instead.
      max_completion_tokens: params.maxTokens ?? 4096,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (acceptsCustomTemperature(params.model)) {
      body.temperature = params.temperature ?? 0.3;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
    const response = await fetch(`${this.baseUrl}/embeddings`, {
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
