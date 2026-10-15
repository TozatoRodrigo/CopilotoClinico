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
import type {
  ContentBlock,
  Message,
  MessageParam,
  MessageStreamParams,
  TextCitation,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages/messages';
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
  type ResearchCitation,
  type ResearchParams,
  type ResearchResponse,
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

type TokenUsage = Pick<
  BetaUsage,
  'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'
>;

function toCompletionUsage(usage: TokenUsage): CompletionUsage {
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

/**
 * F1 — teto de retomadas de um turno de pesquisa pausado (`pause_turn`): o
 * loop de ferramentas no servidor para em 10 iterações e pode pausar de novo
 * a cada retomada. Três bastam para as buscas que `max_uses` permite.
 */
const MAX_RESEARCH_CONTINUATIONS = 3;

function sumUsage(total: CompletionUsage, usage: CompletionUsage): CompletionUsage {
  return {
    promptTokens: total.promptTokens + usage.promptTokens,
    completionTokens: total.completionTokens + usage.completionTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
    cacheReadTokens: (total.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
    cacheWriteTokens: (total.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    webSearchRequests: (total.webSearchRequests ?? 0) + (usage.webSearchRequests ?? 0),
  };
}

function researchUsage(message: Message): CompletionUsage {
  return {
    ...toCompletionUsage(message.usage),
    webSearchRequests: message.usage.server_tool_use?.web_search_requests ?? 0,
  };
}

interface FetchedDocument {
  url: string;
  title: string | null;
}

/** Páginas lidas pelo `web_fetch`, na ordem em que entraram na conversa. */
function fetchedDocuments(content: readonly ContentBlock[]): FetchedDocument[] {
  return content.flatMap((block) =>
    block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result'
      ? [{ url: block.content.url, title: block.content.content.title }]
      : [],
  );
}

/**
 * Citação de página lida pelo `web_fetch` não traz a URL, só o título e o
 * índice do documento: o título decide quando é único; o índice, na ordem das
 * páginas lidas, desempata.
 */
function fetchedDocumentOf(
  citation: { document_index: number; document_title: string | null },
  documents: readonly FetchedDocument[],
): FetchedDocument | undefined {
  const sameTitle = documents.filter(
    (document) => citation.document_title !== null && document.title === citation.document_title,
  );
  if (sameTitle.length === 1) return sameTitle[0];
  return documents[citation.document_index];
}

function researchCitation(
  citation: TextCitation,
  documents: readonly FetchedDocument[],
): ResearchCitation | null {
  if (citation.type === 'web_search_result_location') {
    return { url: citation.url, title: citation.title, citedText: citation.cited_text };
  }
  if (citation.type === 'search_result_location') return null;
  const document = fetchedDocumentOf(citation, documents);
  return document
    ? { url: document.url, title: document.title, citedText: citation.cited_text }
    : null;
}

function researchCitations(content: readonly ContentBlock[]): ResearchCitation[] {
  const documents = fetchedDocuments(content);
  return content.flatMap((block) =>
    block.type === 'text'
      ? (block.citations ?? []).flatMap((citation) => {
          const resolved = researchCitation(citation, documents);
          return resolved ? [resolved] : [];
        })
      : [],
  );
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

  /**
   * F1 — pesquisa com web search + web fetch nas versões básicas
   * (`web_search_20250305`, `web_fetch_20250910`), restrita a `allowedDomains`. Retoma o
   * turno pausado (`pause_turn`) até MAX_RESEARCH_CONTINUATIONS vezes, soma
   * tokens e buscas de todas as chamadas e devolve o texto e as citações já
   * com a URL de cada página.
   *
   * Sem fallback de recusa: uma recusa aqui só faz a análise seguir sem a
   * pesquisa, e repetir as ferramentas em outro modelo não vale o risco.
   */
  async research(params: ResearchParams): Promise<ResearchResponse> {
    const start = Date.now();
    const request = this.buildResearchRequest(params);
    let message = await this.streamResearch(request);
    const content: ContentBlock[] = [];
    let usage = researchUsage(message);
    let continuations = 0;

    for (;;) {
      content.push(...message.content);
      this.raiseOnRefusalOrTruncation(message, request.max_tokens, usage);
      if (message.stop_reason !== 'pause_turn' || continuations >= MAX_RESEARCH_CONTINUATIONS) {
        break;
      }
      continuations += 1;
      // O turno pausado volta como está, com as mesmas ferramentas: a API
      // retoma do `server_tool_use` pendente (não se manda "continue").
      request.messages = [...request.messages, { role: 'assistant', content: message.content }];
      message = await this.streamResearch(request);
      usage = sumUsage(usage, researchUsage(message));
    }

    if (message.stop_reason === 'pause_turn') {
      this.logger.warn(
        `AI_RESEARCH_PAUSED model=${message.model} continuations=${continuations}: ` +
          'o teto de retomadas acabou antes do fim do turno',
      );
    }
    return {
      text: content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join(''),
      citations: researchCitations(content),
      model: message.model,
      usage,
      latencyMs: Date.now() - start,
      continuations,
      stopReason: message.stop_reason,
    };
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

  private buildResearchRequest(
    params: ResearchParams,
  ): MessageStreamParams & { max_tokens: number; messages: MessageParam[] } {
    const capabilities = claudeCapabilities(params.model);
    const allowedDomains = [...params.allowedDomains];
    // Versões básicas de propósito. Medido em 11/10/2026 com a mesma pergunta
    // (dengue grupo C + janela de trombólise, gov.br): `web_search_20250305`
    // devolveu 6 citações com URL e trecho literal do manual do MS e da Conitec;
    // `web_search_20260209` (filtragem dinâmica em execução de código) devolveu
    // os mesmos 18 resultados e ZERO citações. Sem citação a pesquisa não vira
    // evidência citável — e a análise cairia em `model_only` sem ninguém notar.
    // Bônus: as versões básicas não têm a restrição de ZDR da filtragem dinâmica.
    const tools: ToolUnion[] = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: params.maxSearches,
        allowed_domains: allowedDomains,
      },
      {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: params.maxFetches,
        allowed_domains: allowedDomains,
        citations: { enabled: true },
        max_content_tokens: params.maxFetchContentTokens,
      },
    ];

    this.logger.debug(
      `Anthropic research request: model=${params.model} effort=${params.effort ?? this.defaultEffort} ` +
        `domains=${allowedDomains.length} maxSearches=${params.maxSearches}`,
    );

    return {
      model: params.model,
      max_tokens: params.maxTokens ?? this.defaultMaxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.prompt }],
      tools,
      ...(capabilities.adaptiveThinking
        ? {
            thinking: { type: 'adaptive' },
            output_config: { effort: params.effort ?? this.defaultEffort },
          }
        : { temperature: LEGACY_DEFAULT_TEMPERATURE }),
    };
  }

  private streamResearch(request: MessageStreamParams): Promise<Message> {
    return this.logApiErrors(() => this.client.messages.stream(request).finalMessage());
  }

  private raiseOnRefusalOrTruncation(
    message: Pick<Message | BetaMessage, 'stop_reason' | 'stop_details' | 'model'>,
    maxTokens: number,
    usage: CompletionUsage,
  ): void {
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
        `AI_OUTPUT_TRUNCATED model=${message.model} maxTokens=${maxTokens} ` +
          `outputTokens=${usage.completionTokens}`,
      );
      throw new AiTruncatedError({ model: message.model, maxTokens, usage });
    }
  }

  private toResult(message: BetaMessage, request: BetaMessageStreamParams): StreamCompletionResult {
    const usage = toCompletionUsage(message.usage);
    this.logFallbackServed(message, request.model);
    this.raiseOnRefusalOrTruncation(message, request.max_tokens, usage);

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
