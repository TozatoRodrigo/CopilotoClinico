import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
} from './providers/provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAIProvider } from './providers/openai.provider';

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly provider: AIProvider;
  private readonly defaultModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(private readonly config: ConfigService) {
    const providerName = this.config.get<string>('AI_PROVIDER', 'openai');
    this.defaultModel = this.config.getOrThrow<string>('AI_MODEL');
    this.defaultEmbeddingModel = this.config.getOrThrow<string>('AI_EMBEDDING_MODEL');

    switch (providerName) {
      case 'openai':
        this.provider = new OpenAIProvider(config);
        break;
      default:
        this.provider = new AnthropicProvider(config);
        break;
    }

    this.logger.log(`AI Gateway initialized with provider: ${this.provider.name}`);
  }

  async complete(
    params: Omit<CompletionParams, 'model'> & { model?: string },
  ): Promise<CompletionResponse> {
    const fullParams: CompletionParams = {
      ...params,
      model: params.model ?? this.defaultModel,
    };

    this.logger.debug(
      `Completion request: model=${fullParams.model}, messages=${fullParams.messages.length}`,
    );
    const result = await this.provider.complete(fullParams);
    this.logger.debug(
      `Completion response: latency=${result.latencyMs}ms, tokens=${result.usage.totalTokens}`,
    );
    return result;
  }

  async embed(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const params: EmbeddingParams = {
      model: model ?? this.defaultEmbeddingModel,
      texts,
    };

    this.logger.debug(`Embedding request: model=${params.model}, texts=${params.texts.length}`);
    const result = await this.provider.embed(params);
    this.logger.debug(`Embedding response: tokens=${result.usage.totalTokens}`);
    return result;
  }

  getProviderName(): string {
    return this.provider.name;
  }
}
