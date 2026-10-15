import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  AiCapabilityUnsupportedError,
  AiRefusalError,
  AiTruncatedError,
} from '../ai-gateway.errors';
import {
  readFlag,
  readMaxOutputTokens,
  readNonNegativeInteger,
  readOptionalChoice,
} from '../ai-gateway.settings';
import type { MaxTokensParam, StructuredOutputMode } from '../provider-profiles';
import type {
  AiEffort,
  AIProvider,
  ChatMessage,
  CompletionParams,
  CompletionResponse,
  CompletionUsage,
  EmbeddingParams,
  EmbeddingResponse,
  JsonResponseSchema,
  ProviderOverrides,
  ResearchResponse,
  StreamCompletionResult,
} from './provider.interface';

// OpenAI's reasoning-style model families (o-series, gpt-5.x and later) reject
// any `temperature` other than the implicit default (1) — the param must be
// omitted entirely rather than sent as 1, since some of these models reject
// the key being present at all. Only these families accept `reasoning_effort`.
// F0-A — gpt-6.x também rejeita (verificado em 10/10/2026 com gpt-6.1-sol):
// a regra cobre qualquer geração gpt ≥ 5 para não quebrar na próxima.
// O gpt-oss (pesos abertos, servido pela Groq e outros hosts) também raciocina
// e aceita `reasoning_effort`. Hosts compatíveis prefixam o fornecedor no id
// (`openai/gpt-oss-120b`).
const REASONING_MODEL = /^(?:[\w.-]+\/)?(?:o\d|gpt-(?:[5-9]|\d{2,})(?:\b|[.-])|gpt-oss\b)/i;
const OPEN_WEIGHT_REASONING_MODEL = /^(?:[\w.-]+\/)?gpt-oss\b/i;
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
const DEFAULT_TEMPERATURE = 0.3;
const SSE_DATA_PREFIX = 'data: ';
const SSE_DONE = '[DONE]';

/** `effort` da etapa no vocabulário da OpenAI; o gpt-oss só tem low, medium e high. */
const OPENAI_EFFORT: Record<AiEffort, ReasoningEffort> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
};
const OPEN_WEIGHT_EFFORT: Record<ReasoningEffort, ReasoningEffort> = {
  none: 'low',
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'high',
};

/**
 * Prazos e novas tentativas. Sem prazo, um host travado segura a análise do
 * médico indefinidamente; sem nova tentativa, um 429 passageiro vira erro.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_RETRY_AFTER_MS = 30_000;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MAX_LOGGED_ERROR_MESSAGE_CHARS = 160;

/**
 * Modelos de raciocínio abertos (Qwen, DeepSeek, GLM) em alguns hosts mandam o
 * pensamento no próprio conteúdo, antes da resposta. O JSON vem depois dele.
 */
const LEADING_REASONING_BLOCK = /^\s*<think>[\s\S]*?<\/think>\s*/;

const UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  prompt_tokens_details: z.object({ cached_tokens: z.number().nullish() }).nullish(),
});

const ChatCompletionSchema = z.object({
  model: z.string(),
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: UsageSchema.nullish(),
});

const ChatCompletionChunkSchema = z.object({
  model: z.string().nullish(),
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }).nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .default([]),
  usage: UsageSchema.nullish(),
});

const ProviderErrorSchema = z.object({
  error: z.object({
    message: z.string().nullish(),
    type: z.string().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

type ResponseFormat =
  | {
      type: 'json_schema';
      json_schema: { name: string; schema: Record<string, unknown>; strict: true };
    }
  | { type: 'json_object' };

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_completion_tokens?: number;
  max_tokens?: number;
  temperature?: number;
  reasoning_effort?: ReasoningEffort;
  response_format?: ResponseFormat;
  stream?: true;
  stream_options?: { include_usage: true };
}

interface BuiltRequest {
  body: ChatCompletionRequest;
  maxTokens: number;
}

interface FinishedCompletion {
  model: string;
  usage: CompletionUsage;
  finishReason: string | null;
  refusal: string;
  maxTokens: number;
}

const EMPTY_USAGE: CompletionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

// `prompt_tokens` já inclui os tokens servidos do cache — mesma semântica de
// `CompletionUsage.promptTokens`.
function toCompletionUsage(usage: z.infer<typeof UsageSchema> | null | undefined): CompletionUsage {
  if (!usage) return EMPTY_USAGE;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

function withoutReasoningBlock(content: string): string {
  return content.replace(LEADING_REASONING_BLOCK, '');
}

function reasoningEffortFor(
  model: string,
  effort: AiEffort | undefined,
  fallback: ReasoningEffort | undefined,
): ReasoningEffort | undefined {
  const requested = effort ? OPENAI_EFFORT[effort] : fallback;
  if (!requested) return undefined;
  return OPEN_WEIGHT_REASONING_MODEL.test(model) ? OPEN_WEIGHT_EFFORT[requested] : requested;
}

/** `Retry-After` em segundos quando o host manda; senão, espera exponencial. */
function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return RETRY_BASE_DELAY_MS * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Só tipo, código e o começo da mensagem: o corpo de erro de alguns hosts
 * repete trechos da entrada, e a entrada é o caso clínico.
 */
async function describeProviderError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = ProviderErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      const { message, type, code } = parsed.data.error;
      const shortMessage = (message ?? '').slice(0, MAX_LOGGED_ERROR_MESSAGE_CHARS);
      return `type=${type ?? '-'} code=${code ?? '-'} message="${shortMessage}"`;
    }
  } catch {
    // corpo que não é JSON: só o tamanho vai para o log
  }
  return `bodyChars=${text.length}`;
}

/**
 * Prazo de uma requisição: até os cabeçalhos (e o corpo, sem stream) e, no
 * stream, entre um pedaço e outro. Estourado, aborta o fetch.
 */
class RequestDeadline {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  timedOut = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  arm(ms: number): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort();
    }, ms);
  }

  clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

async function* readSseData(
  body: ReadableStream<Uint8Array>,
  onRead: () => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      onRead();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith(SSE_DATA_PREFIX)) continue;
        const data = line.slice(SSE_DATA_PREFIX.length).trim();
        if (data === SSE_DONE) return;
        yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseChunk(data: string): z.infer<typeof ChatCompletionChunkSchema> | null {
  try {
    const result = ChatCompletionChunkSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    // skip malformed SSE data
    return null;
  }
}

/**
 * Provedor para a API da OpenAI e para os hosts compatíveis com ela (Groq,
 * Together, DeepInfra, Z.ai...). O que muda entre hosts vem do perfil
 * (provider-profiles.ts): forma de pedir JSON, nome do teto de tokens e
 * campos próprios do host.
 */
@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultMaxTokens: number;
  private readonly reasoningEffort: ReasoningEffort | undefined;
  private readonly structuredOutput: StructuredOutputMode;
  private readonly maxTokensParam: MaxTokensParam;
  private readonly extraBody: Record<string, unknown>;
  private readonly requestTimeoutMs: number;
  private readonly streamIdleTimeoutMs: number;
  private readonly maxRetries: number;

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
    this.defaultMaxTokens = readMaxOutputTokens(config);
    this.reasoningEffort = readOptionalChoice(config, 'AI_REASONING_EFFORT', REASONING_EFFORTS);
    // Provedor padrão: desligado, para o baseline do bake-off ser idêntico a
    // produção. Um perfil nomeado diz o modo do host dele.
    this.structuredOutput =
      overrides?.structuredOutput ??
      (readFlag(config, 'AI_OPENAI_STRUCTURED_OUTPUT', false) ? 'json_schema' : 'off');
    this.maxTokensParam = overrides?.maxTokensParam ?? 'max_completion_tokens';
    this.extraBody = overrides?.extraBody ?? {};
    this.requestTimeoutMs = readNonNegativeInteger(
      config,
      'AI_REQUEST_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
      { allowZero: false },
    );
    this.streamIdleTimeoutMs = readNonNegativeInteger(
      config,
      'AI_STREAM_IDLE_TIMEOUT_MS',
      DEFAULT_STREAM_IDLE_TIMEOUT_MS,
      { allowZero: false },
    );
    this.maxRetries = readNonNegativeInteger(config, 'AI_REQUEST_MAX_RETRIES', DEFAULT_MAX_RETRIES);
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const start = Date.now();
    const { body, maxTokens } = this.buildRequest(params);
    const { response, deadline } = await this.postChatCompletion(body, 'API');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (deadline.timedOut) throw this.timeoutError('API', this.requestTimeoutMs, error);
      throw error;
    } finally {
      deadline.clear();
    }

    const completion = ChatCompletionSchema.parse(payload);
    const choice = completion.choices[0];
    const usage = toCompletionUsage(completion.usage);

    this.assertFinished({
      model: completion.model,
      usage,
      finishReason: choice?.finish_reason ?? null,
      refusal: choice?.message.refusal ?? '',
      maxTokens,
    });

    return {
      content: withoutReasoningBlock(choice?.message.content ?? ''),
      model: completion.model,
      usage,
      latencyMs: Date.now() - start,
    };
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string, StreamCompletionResult> {
    const { body: baseBody, maxTokens } = this.buildRequest(params);
    const body: ChatCompletionRequest = {
      ...baseBody,
      stream: true,
      stream_options: { include_usage: true },
    };
    const { response, deadline } = await this.postChatCompletion(body, 'stream');
    if (!response.body) {
      deadline.clear();
      throw new Error('AI provider error: empty stream body');
    }

    let content = '';
    let refusal = '';
    let model = params.model;
    let finishReason: string | null = null;
    let usage = EMPTY_USAGE;

    deadline.arm(this.streamIdleTimeoutMs);
    try {
      for await (const data of readSseData(response.body, () =>
        deadline.arm(this.streamIdleTimeoutMs),
      )) {
        const chunk = parseChunk(data);
        if (!chunk) continue;

        model = chunk.model ?? model;
        // Com include_usage, o último chunk traz `choices: []` e o usage da chamada.
        if (chunk.usage) usage = toCompletionUsage(chunk.usage);
        const choice = chunk.choices[0];
        finishReason = choice?.finish_reason ?? finishReason;
        refusal += choice?.delta?.refusal ?? '';

        const delta = choice?.delta?.content;
        if (delta) {
          content += delta;
          yield delta;
        }
      }
    } catch (error) {
      if (deadline.timedOut) throw this.timeoutError('stream', this.streamIdleTimeoutMs, error);
      throw error;
    } finally {
      deadline.clear();
    }

    this.assertFinished({ model, usage, finishReason, refusal, maxTokens });
    return { content: withoutReasoningBlock(content), model, usage, stopReason: finishReason };
  }

  /**
   * F1 — a pesquisa web usa as ferramentas de servidor da Anthropic; a
   * OpenAI não as tem. A análise segue sem a pesquisa.
   */
  async research(): Promise<ResearchResponse> {
    throw new AiCapabilityUnsupportedError({ provider: this.name, capability: 'web_research' });
  }

  async embed(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ model: params.model, input: params.texts }),
    });

    if (!response.ok) {
      this.logger.error(
        `AI_PROVIDER_ERROR operation=embed status=${response.status} ${await describeProviderError(response)}`,
      );
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

  private buildRequest(params: CompletionParams): BuiltRequest {
    const isReasoningModel = REASONING_MODEL.test(params.model);
    // On reasoning models this cap also covers the reasoning tokens, hence the
    // generous default.
    const maxTokens = params.maxTokens ?? this.defaultMaxTokens;
    const reasoningEffort = isReasoningModel
      ? reasoningEffortFor(params.model, params.effort, this.reasoningEffort)
      : undefined;
    const responseFormat = this.responseFormat(params.responseSchema);

    return {
      maxTokens,
      body: {
        model: params.model,
        // Newer models (gpt-5.x, o1/o3 reasoning family) reject `max_tokens` outright
        // and require `max_completion_tokens`; some compatible hosts only know `max_tokens`.
        ...(this.maxTokensParam === 'max_tokens'
          ? { max_tokens: maxTokens }
          : { max_completion_tokens: maxTokens }),
        messages: params.messages.map(({ role, content }) => ({ role, content })),
        ...(!isReasoningModel && { temperature: params.temperature ?? DEFAULT_TEMPERATURE }),
        ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
        ...(responseFormat && { response_format: responseFormat }),
      },
    };
  }

  private responseFormat(schema: JsonResponseSchema | undefined): ResponseFormat | undefined {
    if (!schema) return undefined;
    switch (this.structuredOutput) {
      case 'json_schema':
        return {
          type: 'json_schema',
          json_schema: { name: schema.name, schema: schema.schema, strict: true },
        };
      case 'json_object':
        return { type: 'json_object' };
      case 'off':
        return undefined;
    }
  }

  /**
   * Nova tentativa só antes de a resposta começar: 429, 5xx, prazo estourado
   * ou falha de rede. Depois dos cabeçalhos, quem chama lê o corpo com o
   * mesmo prazo (`deadline`) e o limpa ao terminar.
   */
  private async postChatCompletion(
    body: ChatCompletionRequest,
    operation: 'API' | 'stream',
  ): Promise<{ response: Response; deadline: RequestDeadline }> {
    // Campos próprios do host entram por último: um campo repetido substitui o nosso.
    const payload = JSON.stringify({ ...body, ...this.extraBody });

    for (let attempt = 0; ; attempt++) {
      const deadline = new RequestDeadline();
      deadline.arm(this.requestTimeoutMs);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers,
          body: payload,
          signal: deadline.signal,
        });
      } catch (error) {
        deadline.clear();
        const failure = deadline.timedOut
          ? this.timeoutError(operation, this.requestTimeoutMs, error)
          : new Error('AI provider network error', { cause: error });
        if (attempt >= this.maxRetries) throw failure;
        this.logger.warn(
          `AI_PROVIDER_RETRY operation=${operation} attempt=${attempt + 1} reason="${failure.message}"`,
        );
        await sleep(retryDelayMs(attempt, null));
        continue;
      }

      if (response.ok) return { response, deadline };
      deadline.clear();

      const detail = await describeProviderError(response);
      if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
        this.logger.warn(
          `AI_PROVIDER_RETRY operation=${operation} attempt=${attempt + 1} status=${response.status} ${detail}`,
        );
        await sleep(retryDelayMs(attempt, response.headers.get('retry-after')));
        continue;
      }
      this.logger.error(
        `AI_PROVIDER_ERROR operation=${operation} status=${response.status} ${detail}`,
      );
      throw new Error(`AI provider error: ${response.status}`);
    }
  }

  private timeoutError(operation: 'API' | 'stream', timeoutMs: number, cause: unknown): Error {
    return new Error(`AI provider ${operation} timeout after ${timeoutMs}ms`, { cause });
  }

  private assertFinished(completion: FinishedCompletion): void {
    const { model, usage, finishReason, refusal, maxTokens } = completion;

    if (refusal || finishReason === 'content_filter') {
      this.logger.warn(`AI_REFUSAL model=${model} finishReason=${finishReason ?? '-'}`);
      throw new AiRefusalError({
        model,
        category: refusal ? null : 'content_filter',
        explanation: refusal || null,
        usage,
      });
    }

    if (finishReason === 'length') {
      this.logger.warn(
        `AI_OUTPUT_TRUNCATED model=${model} maxTokens=${maxTokens} outputTokens=${usage.completionTokens}`,
      );
      throw new AiTruncatedError({ model, maxTokens, usage });
    }
  }
}
