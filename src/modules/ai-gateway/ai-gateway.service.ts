import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
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
import { AiEmbeddingsDisabledError, errorTypeOf } from './ai-gateway.errors';
import { AI_CALL_SINK, type AiCallSink } from './ai-call-trace';
import { TracingAiProvider } from './tracing-provider';
import { DEFAULT_PROFILE, parseModelRef, readProviderProfiles } from './provider-profiles';
import { errorAfterFailedFallback, readFallbackModel, unavailabilityOf } from './provider-fallback';
import { currentRequestContext } from '../../shared/request-context/request-context';

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

/** O que quem chama passa: o modelo é opcional, e a marca da reserva é só do gateway. */
export type GatewayCompletionParams = Omit<CompletionParams, 'model' | 'fallbackFrom'> & {
  model?: string;
};

interface PreparedCall {
  route: ModelRoute;
  params: CompletionParams;
}

/**
 * Repassa os deltas e marca o primeiro: depois dele a etapa não troca de
 * modelo. Fecha a fonte se quem consome sair no meio, como o `yield*` faria,
 * para o modelo parar de gerar.
 */
async function* trackFirstDelta<Result>(
  source: AsyncIterator<string, Result>,
  progress: { started: boolean },
): AsyncGenerator<string, Result> {
  let settled = false;
  try {
    for (;;) {
      const next = await source.next();
      if (next.done) {
        settled = true;
        return next.value;
      }
      progress.started = true;
      yield next.value;
    }
  } catch (error) {
    settled = true;
    throw error;
  } finally {
    if (!settled) await source.return?.();
  }
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

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional() @Inject(AI_CALL_SINK) callSink?: AiCallSink,
  ) {
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
    // Rastro de cada chamada (ai_calls) quando há quem o guarde; o gabarito
    // e os testes constroem o gateway sem ele.
    if (callSink) {
      for (const [profile, provider] of this.completionProviders) {
        this.completionProviders.set(profile, new TracingAiProvider(provider, profile, callSink));
      }
    }

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
      `AI Gateway: completion=${this.getProviderName()}, profiles=${profileSummary || '-'}, ` +
        `embedding=${this.getEmbeddingProviderName()}, fallback=${readFallbackModel(this.config, 'other') ?? '-'}`,
    );
  }

  /** Com reserva configurada, uma falha por indisponibilidade repete a chamada no modelo dela. */
  async complete(params: GatewayCompletionParams): Promise<CompletionResponse> {
    const call = this.prepare(params);

    this.logger.debug(
      `Completion request: model=${call.params.model}, messages=${call.params.messages.length}`,
    );
    let result: CompletionResponse;
    try {
      result = await call.route.provider.complete(call.params);
    } catch (error) {
      const fallback = this.fallbackFor(call, error);
      if (!fallback) throw error;
      try {
        result = await fallback.route.provider.complete(fallback.params);
      } catch (fallbackError) {
        throw this.fallbackFailed(fallback, error, fallbackError);
      }
    }
    this.logger.debug(
      `Completion response: latency=${result.latencyMs}ms, tokens=${result.usage.totalTokens}`,
    );
    return result;
  }

  /**
   * Emite os deltas de texto e devolve, como valor de retorno do gerador,
   * texto final, modelo, usage e stop reason — `for await` continua
   * funcionando; quem precisa do custo itera com `next()` até `done`.
   *
   * A reserva só entra se o stream cair antes do primeiro delta: depois dele,
   * trocar de modelo misturaria duas respostas.
   */
  async *completeStream(
    params: GatewayCompletionParams,
  ): AsyncGenerator<string, StreamCompletionResult> {
    const call = this.prepare(params);

    this.logger.debug(
      `Stream request: model=${call.params.model}, messages=${call.params.messages.length}`,
    );
    const progress = { started: false };
    let result: StreamCompletionResult;
    try {
      result = yield* trackFirstDelta(call.route.provider.completeStream(call.params), progress);
    } catch (error) {
      const fallback = this.fallbackFor(call, error, progress.started);
      if (!fallback) throw error;
      try {
        result = yield* fallback.route.provider.completeStream(fallback.params);
      } catch (fallbackError) {
        throw this.fallbackFailed(fallback, error, fallbackError);
      }
    }
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

  private prepare(params: GatewayCompletionParams): PreparedCall {
    const route = this.route(params.model);
    return {
      route,
      params: {
        ...params,
        model: route.model,
        responseSchema: this.structuredOutputEnabled ? params.responseSchema : undefined,
      },
    };
  }

  /**
   * A chamada no modelo de reserva, quando cabe: reserva configurada para a
   * etapa, falha por indisponibilidade, nenhum delta emitido e reserva em
   * outro perfil — no mesmo, o host que caiu responderia de novo. O log não
   * leva texto do caso: só etapa, perfis, modelos, motivo e classe do erro.
   */
  private fallbackFor(
    call: PreparedCall,
    error: unknown,
    streamStarted = false,
  ): PreparedCall | null {
    const stage = call.params.stage ?? 'other';
    const fallbackRef = readFallbackModel(this.config, stage);
    if (!fallbackRef) return null;
    const reason = unavailabilityOf(error);
    if (!reason) return null;

    const route = this.route(fallbackRef);
    const fields =
      `stage=${stage} from=${call.route.profile} fromModel=${call.route.model} ` +
      `to=${route.profile} toModel=${route.model} reason=${reason} error=${errorTypeOf(error)} ` +
      `requestId=${currentRequestContext()?.requestId ?? '-'}`;
    const skipped =
      route.profile === call.route.profile
        ? 'reserva no mesmo perfil que caiu'
        : streamStarted
          ? 'o stream já tinha começado'
          : null;
    if (skipped) {
      this.logger.warn(`AI_FALLBACK_SKIPPED ${fields}: ${skipped}`);
      return null;
    }

    this.logger.warn(`AI_FALLBACK ${fields}`);
    return {
      route,
      params: { ...call.params, model: route.model, fallbackFrom: call.route.profile },
    };
  }

  /** A reserva também falhou: fica no log e volta o erro que explica a falha (provider-fallback.ts). */
  private fallbackFailed(
    fallback: PreparedCall,
    original: unknown,
    fallbackError: unknown,
  ): unknown {
    this.logger.error(
      `AI_FALLBACK_FAILED stage=${fallback.params.stage ?? 'other'} from=${fallback.params.fallbackFrom ?? '-'} ` +
        `to=${fallback.route.profile} toModel=${fallback.route.model} original=${errorTypeOf(original)} ` +
        `error=${errorTypeOf(fallbackError)} requestId=${currentRequestContext()?.requestId ?? '-'}`,
    );
    return errorAfterFailedFallback(original, fallbackError);
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
