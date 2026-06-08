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

function createProvider(name: string, config: ConfigService, apiKey: string, baseUrl?: string): AIProvider {
  const overrides = { apiKey, baseUrl };
  switch (name) {
    case 'openai':
      return new OpenAIProvider(config, overrides);
    default:
      return new AnthropicProvider(config, overrides);
  }
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly completionProvider: AIProvider;
  private readonly embeddingProvider: AIProvider;
  private readonly defaultModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(private readonly config: ConfigService) {
    this.defaultModel = this.config.getOrThrow<string>('AI_MODEL');
    this.defaultEmbeddingModel = this.config.getOrThrow<string>('AI_EMBEDDING_MODEL');

    // Completion provider
    const completionProviderName = this.config.get<string>('AI_PROVIDER', 'anthropic');
    const completionApiKey = this.config.getOrThrow<string>('AI_API_KEY');
    const completionBaseUrl = this.config.get<string>('AI_BASE_URL');
    this.completionProvider = createProvider(completionProviderName, config, completionApiKey, completionBaseUrl);

    // Embedding provider — defaults to openai when completion is anthropic (Anthropic has no embeddings API)
    const defaultEmbeddingProvider = completionProviderName === 'anthropic' ? 'openai' : completionProviderName;
    const embeddingProviderName = this.config.get<string>('EMBEDDING_PROVIDER', defaultEmbeddingProvider);
    const embeddingApiKey =
      this.config.get<string>('EMBEDDING_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY') ??
      completionApiKey;
    const embeddingBaseUrl = this.config.get<string>('EMBEDDING_BASE_URL');
    this.embeddingProvider = createProvider(embeddingProviderName, config, embeddingApiKey, embeddingBaseUrl);

    this.logger.log(
      `AI Gateway: completion=${this.completionProvider.name}, embedding=${this.embeddingProvider.name}`,
    );
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
    const result = await this.completionProvider.complete(fullParams);
    this.logger.debug(
      `Completion response: latency=${result.latencyMs}ms, tokens=${result.usage.totalTokens}`,
    );
    return result;
  }

  async *completeStream(
    params: Omit<CompletionParams, 'model'> & { model?: string },
  ): AsyncGenerator<string> {
    const fullParams: CompletionParams = {
      ...params,
      model: params.model ?? this.defaultModel,
    };

    this.logger.debug(
      `Stream request: model=${fullParams.model}, messages=${fullParams.messages.length}`,
    );
    yield* this.completionProvider.completeStream(fullParams);
  }

  async embed(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const params: EmbeddingParams = {
      model: model ?? this.defaultEmbeddingModel,
      texts,
    };

    this.logger.debug(`Embedding request: model=${params.model}, texts=${params.texts.length}`);
    const result = await this.embeddingProvider.embed(params);
    this.logger.debug(`Embedding response: tokens=${result.usage.totalTokens}`);
    return result;
  }

  getProviderName(): string {
    return this.completionProvider.name;
  }

  getEmbeddingProviderName(): string {
    return this.embeddingProvider.name;
  }
}
