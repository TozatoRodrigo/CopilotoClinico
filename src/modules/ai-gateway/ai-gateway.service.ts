import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
  ResearchParams,
  ResearchResponse,
  StreamCompletionResult,
} from './providers/provider.interface';
import type { ProviderOverrides } from './providers/provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { DeterministicProvider } from './providers/deterministic.provider';
import { readFlag } from './ai-gateway.settings';
import { AiEmbeddingsDisabledError } from './ai-gateway.errors';
import { DEFAULT_PROFILE, parseModelRef, readProviderProfiles } from './provider-profiles';

/** Valor de `EMBEDDING_PROVIDER` que desliga os embeddings. */
export const EMBEDDINGS_DISABLED = 'none';

function createProvider(
  kind: string,
  config: ConfigService,
  overrides: ProviderOverrides,
): AIProvider {
  switch (kind) {
    case 'openai':
      return new OpenAIProvider(config, overrides);
    case 'test':
      // Deterministic, offline provider for E2E/integration tests (F4).
      return new DeterministicProvider(config, overrides);
    default:
      return new AnthropicProvider(config, overrides);
  }
}

/** Para onde vai uma chamada: o provedor do perfil e o modelo sem o prefixo do perfil. */
export interface ModelRoute {
  profile: string;
  provider: AIProvider;
  model: string;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  /** Provedor padrão (`AI_PROVIDER`) e os perfis de `AI_PROVIDER_PROFILES`, por nome. */
  private readonly completionProviders: Map<string, AIProvider>;
  private readonly profileNames: ReadonlySet<string>;
  /** `null` com `EMBEDDING_PROVIDER=none`: nenhuma chamada de embedding sai do serviço. */
  private readonly embeddingProvider: AIProvider | null;
  private readonly defaultModel: string;
  private readonly defaultEmbeddingModel: string;
  private readonly structuredOutputEnabled: boolean;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.defaultModel = this.config.getOrThrow<string>('AI_MODEL');
    this.defaultEmbeddingModel = this.config.getOrThrow<string>('AI_EMBEDDING_MODEL');
    // Chave geral de structured outputs: com false, nenhum provider recebe o
    // JSON Schema e a saída volta a ser validada só pelo zod.
    this.structuredOutputEnabled = readFlag(this.config, 'AI_STRUCTURED_OUTPUT', true);

    // Completion providers: o padrão e os perfis nomeados.
    const completionProviderName = this.config.get<string>('AI_PROVIDER', 'anthropic');
    const completionApiKey = this.config.getOrThrow<string>('AI_API_KEY');
    const completionBaseUrl = this.config.get<string>('AI_BASE_URL');
    const profiles = readProviderProfiles(this.config);
    this.completionProviders = new Map([
      [
        DEFAULT_PROFILE,
        createProvider(completionProviderName, config, {
          apiKey: completionApiKey,
          baseUrl: completionBaseUrl,
        }),
      ],
      ...profiles.map((profile): [string, AIProvider] => [
        profile.name,
        createProvider(profile.kind, config, {
          apiKey: profile.apiKey,
          baseUrl: profile.baseUrl,
          structuredOutput: profile.structuredOutput,
          maxTokensParam: profile.maxTokensParam,
          extraBody: profile.extraBody,
        }),
      ]),
    ]);
    this.profileNames = new Set(profiles.map(({ name }) => name));

    // Embedding provider — defaults to openai when completion is anthropic
    // (Anthropic has no embeddings API). Em modo "test" (determinístico/offline,
    // F4), embeddings também usam o provider de teste — ignorando EMBEDDING_PROVIDER,
    // que caso contrário apontaria para um provider real sem chave/URL e quebraria
    // o pipeline (ex.: "Failed to parse URL from /v1/embeddings").
    const embeddingProviderName =
      completionProviderName === 'test'
        ? 'test'
        : this.config.get<string>(
            'EMBEDDING_PROVIDER',
            completionProviderName === 'anthropic' ? 'openai' : completionProviderName,
          );
    const embeddingApiKey =
      this.config.get<string>('EMBEDDING_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY') ??
      completionApiKey;
    const embeddingBaseUrl = this.config.get<string>('EMBEDDING_BASE_URL');
    this.embeddingProvider =
      embeddingProviderName === EMBEDDINGS_DISABLED
        ? null
        : createProvider(embeddingProviderName, config, {
            apiKey: embeddingApiKey,
            baseUrl: embeddingBaseUrl,
          });

    const profileSummary = profiles.map(({ name, kind }) => `${name}=${kind}`).join(',');
    this.logger.log(
      `AI Gateway: completion=${this.getProviderName()}, profiles=${profileSummary || '-'}, embedding=${this.getEmbeddingProviderName()}`,
    );
  }

  async complete(
    params: Omit<CompletionParams, 'model'> & { model?: string },
  ): Promise<CompletionResponse> {
    const { provider, fullParams } = this.prepare(params);

    this.logger.debug(
      `Completion request: model=${fullParams.model}, messages=${fullParams.messages.length}`,
    );
    const result = await provider.complete(fullParams);
    this.logger.debug(
      `Completion response: latency=${result.latencyMs}ms, tokens=${result.usage.totalTokens}`,
    );
    return result;
  }

  /**
   * Emite os deltas de texto e devolve, como valor de retorno do gerador,
   * texto final, modelo, usage e stop reason — `for await` continua
   * funcionando; quem precisa do custo itera com `next()` até `done`.
   */
  async *completeStream(
    params: Omit<CompletionParams, 'model'> & { model?: string },
  ): AsyncGenerator<string, StreamCompletionResult> {
    const { provider, fullParams } = this.prepare(params);

    this.logger.debug(
      `Stream request: model=${fullParams.model}, messages=${fullParams.messages.length}`,
    );
    const result = yield* provider.completeStream(fullParams);
    this.logger.debug(
      `Stream response: model=${result.model}, tokens=${result.usage.totalTokens}, stop=${result.stopReason ?? '-'}`,
    );
    return result;
  }

  /**
   * F1 — pesquisa web com as ferramentas de servidor do provider de
   * completion. Só a Anthropic implementa; nos demais lança
   * `AiCapabilityUnsupportedError` e quem chama segue sem a pesquisa.
   */
  async research(
    params: Omit<ResearchParams, 'model'> & { model?: string },
  ): Promise<ResearchResponse> {
    const { provider, model } = this.route(params.model);
    this.logger.debug(
      `Research request: model=${model}, domains=${params.allowedDomains.length}, maxSearches=${params.maxSearches}`,
    );
    const result = await provider.research({ ...params, model });
    this.logger.debug(
      `Research response: latency=${result.latencyMs}ms, searches=${result.usage.webSearchRequests ?? 0}, citations=${result.citations.length}`,
    );
    return result;
  }

  /** `false` com `EMBEDDING_PROVIDER=none`: quem chama já segue sem vetor, sem tentar. */
  embeddingsEnabled(): boolean {
    return this.embeddingProvider !== null;
  }

  async embed(texts: string[], model?: string): Promise<EmbeddingResponse> {
    if (!this.embeddingProvider) throw new AiEmbeddingsDisabledError();
    const params: EmbeddingParams = {
      model: model ?? this.defaultEmbeddingModel,
      texts,
    };

    this.logger.debug(`Embedding request: model=${params.model}, texts=${params.texts.length}`);
    const result = await this.embeddingProvider.embed(params);
    this.logger.debug(`Embedding response: tokens=${result.usage.totalTokens}`);
    return result;
  }

  /**
   * Resolve a referência do modelo (`perfil:modelo` ou só `modelo`, no
   * provedor padrão). Sem referência, vale `AI_MODEL`, que também pode
   * apontar para um perfil.
   */
  route(modelRef?: string): ModelRoute {
    const { profile, model } = parseModelRef(modelRef ?? this.defaultModel, this.profileNames);
    const provider = this.completionProviders.get(profile);
    if (!provider) throw new Error(`AI provider profile "${profile}" is not configured.`);
    return { profile, provider, model };
  }

  private prepare(params: Omit<CompletionParams, 'model'> & { model?: string }): {
    provider: AIProvider;
    fullParams: CompletionParams;
  } {
    const { provider, model } = this.route(params.model);
    return {
      provider,
      fullParams: {
        ...params,
        model,
        responseSchema: this.structuredOutputEnabled ? params.responseSchema : undefined,
      },
    };
  }

  /** Nome do provedor (`anthropic`, `openai`, `test`) que atende a referência; sem ela, o de `AI_MODEL`. */
  getProviderName(modelRef?: string): string {
    return this.route(modelRef).provider.name;
  }

  getEmbeddingProviderName(): string {
    return this.embeddingProvider?.name ?? EMBEDDINGS_DISABLED;
  }

  /** Modelo de embedding padrão — entra na chave do cache do retrieval. */
  getEmbeddingModel(): string {
    return this.defaultEmbeddingModel;
  }
}
