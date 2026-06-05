import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
} from './provider.interface';

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('OPENAI_API_KEY') ?? this.config.getOrThrow<string>('AI_API_KEY');
    this.baseUrl = this.config.get<string>('AI_BASE_URL', 'https://api.openai.com');
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
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
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

  async embed(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
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
