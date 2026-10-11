import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  AiCapabilityUnsupportedError,
  AiRefusalError,
  AiTruncatedError,
} from '../ai-gateway.errors';
import { readFlag, readMaxOutputTokens, readOptionalChoice } from '../ai-gateway.settings';
import type {
  AIProvider,
  ChatMessage,
  CompletionParams,
  CompletionResponse,
  CompletionUsage,
  EmbeddingParams,
  EmbeddingResponse,
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
const REASONING_MODEL = /^(o\d|gpt-([5-9]|\d{2,})(\b|[.-]))/i;
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
const DEFAULT_TEMPERATURE = 0.3;
const SSE_DATA_PREFIX = 'data: ';
const SSE_DONE = '[DONE]';

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

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_completion_tokens: number;
  temperature?: number;
  reasoning_effort?: ReasoningEffort;
  response_format?: {
    type: 'json_schema';
    json_schema: { name: string; schema: Record<string, unknown>; strict: true };
  };
  stream?: true;
  stream_options?: { include_usage: true };
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

async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
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

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultMaxTokens: number;
  private readonly reasoningEffort: ReasoningEffort | undefined;
  private readonly structuredOutputEnabled: boolean;

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
    // Desligado por padrão: o baseline do bake-off precisa ser idêntico a produção.
    this.structuredOutputEnabled = readFlag(config, 'AI_OPENAI_STRUCTURED_OUTPUT', false);
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const start = Date.now();
    const body = this.buildBody(params);
    const response = await this.postChatCompletion(body, 'API');
    const completion = ChatCompletionSchema.parse(await response.json());
    const choice = completion.choices[0];
    const usage = toCompletionUsage(completion.usage);

    this.assertFinished({
      model: completion.model,
      usage,
      finishReason: choice?.finish_reason ?? null,
      refusal: choice?.message.refusal ?? '',
      maxTokens: body.max_completion_tokens,
    });

    return {
      content: choice?.message.content ?? '',
      model: completion.model,
      usage,
      latencyMs: Date.now() - start,
    };
  }

  async *completeStream(params: CompletionParams): AsyncGenerator<string, StreamCompletionResult> {
    const body: ChatCompletionRequest = {
      ...this.buildBody(params),
      stream: true,
      stream_options: { include_usage: true },
    };
    const response = await this.postChatCompletion(body, 'stream');
    if (!response.body) throw new Error('AI provider error: empty stream body');

    let content = '';
    let refusal = '';
    let model = params.model;
    let finishReason: string | null = null;
    let usage = EMPTY_USAGE;

    for await (const data of readSseData(response.body)) {
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

    this.assertFinished({
      model,
      usage,
      finishReason,
      refusal,
      maxTokens: body.max_completion_tokens,
    });
    return { content, model, usage, stopReason: finishReason };
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

  private buildBody(params: CompletionParams): ChatCompletionRequest {
    const isReasoningModel = REASONING_MODEL.test(params.model);
    return {
      model: params.model,
      // Newer models (gpt-5.x, o1/o3 reasoning family) reject `max_tokens` outright
      // and require `max_completion_tokens` instead. On reasoning models this cap
      // also covers the reasoning tokens, hence the generous default.
      max_completion_tokens: params.maxTokens ?? this.defaultMaxTokens,
      messages: params.messages.map(({ role, content }) => ({ role, content })),
      ...(!isReasoningModel && { temperature: params.temperature ?? DEFAULT_TEMPERATURE }),
      ...(isReasoningModel && this.reasoningEffort && { reasoning_effort: this.reasoningEffort }),
      ...(this.structuredOutputEnabled &&
        params.responseSchema && {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: params.responseSchema.name,
              schema: params.responseSchema.schema,
              strict: true,
            },
          },
        }),
    };
  }

  private async postChatCompletion(
    body: ChatCompletionRequest,
    operation: 'API' | 'stream',
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`OpenAI ${operation} error: ${response.status} ${errorText}`);
      throw new Error(`AI provider error: ${response.status}`);
    }
    return response;
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
