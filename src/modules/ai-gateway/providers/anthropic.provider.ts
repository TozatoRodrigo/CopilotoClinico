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
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('ANTHROPIC_API_KEY') ?? this.config.getOrThrow<string>('AI_API_KEY');
    this.baseUrl = this.config.get<string>('AI_BASE_URL', 'https://api.anthropic.com');
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const start = Date.now();
    const url = `${this.baseUrl}/v1/messages`;

    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      messages: params.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
    };

    const systemMessage = params.messages.find((m) => m.role === 'system');
    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
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

  async embed(params: EmbeddingParams): Promise<EmbeddingResponse> {
    void params;
    throw new Error(`Provider ${this.name} does not support embeddings in this gateway`);
  }
}
