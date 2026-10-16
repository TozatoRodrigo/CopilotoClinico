import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider, anthropicUnavailabilityOf } from './anthropic.provider';
import { AiRefusalError, AiTruncatedError } from '../ai-gateway.errors';
import type { CompletionParams, JsonResponseSchema } from './provider.interface';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | {
      type: 'fallback';
      from: { model: string };
      to: { model: string };
      trigger: { type: 'refusal'; category: string | null };
    };

interface FakeMessage {
  model?: string;
  content?: ContentBlock[];
  stopReason?: string;
  stopDetails?: { type: 'refusal'; category: string | null; explanation: string | null } | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  iterations?: Array<{ type: string }>;
}

const RESPONSE_SCHEMA: JsonResponseSchema = {
  name: 'answer',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  },
};

function streamEvents(message: FakeMessage): Array<Record<string, unknown>> {
  const usage = message.usage ?? { input_tokens: 10, output_tokens: 20 };
  const content = message.content ?? [{ type: 'text', text: 'ok' }];
  const blockEvents = content.flatMap((block, index) => {
    const start =
      block.type === 'text'
        ? { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }
        : block.type === 'thinking'
          ? {
              type: 'content_block_start',
              index,
              content_block: { type: 'thinking', thinking: block.thinking, signature: 'sig' },
            }
          : { type: 'content_block_start', index, content_block: block };
    const deltas =
      block.type === 'text'
        ? [{ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }]
        : [];
    return [start, ...deltas, { type: 'content_block_stop', index }];
  });

  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: message.model ?? 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { ...usage, output_tokens: 1 },
      },
    },
    ...blockEvents,
    {
      type: 'message_delta',
      delta: {
        stop_reason: message.stopReason ?? 'end_turn',
        stop_sequence: null,
        stop_details: message.stopDetails ?? null,
      },
      usage: { output_tokens: usage.output_tokens, iterations: message.iterations ?? null },
    },
    { type: 'message_stop' },
  ];
}

function sseResponse(message: FakeMessage): Response {
  const body = streamEvents(message)
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function mockAnthropicApi(message: FakeMessage = {}) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(sseResponse(message)));
}

function sentRequest(fetchMock: ReturnType<typeof mockAnthropicApi>) {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return {
    url: String(url),
    body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    headers: new Headers(init?.headers),
  };
}

function createProvider(env: Record<string, string> = {}) {
  return new AnthropicProvider(new ConfigService({ AI_API_KEY: 'test-key', ...env }), {
    apiKey: 'test-key',
    baseUrl: 'https://anthropic.test',
  });
}

function params(overrides: Partial<CompletionParams> = {}): CompletionParams {
  return {
    model: 'claude-opus-5-5',
    messages: [
      { role: 'system', content: 'System prompt estável' },
      { role: 'user', content: 'Caso clínico' },
    ],
    ...overrides,
  };
}

async function drain<T>(generator: AsyncGenerator<string, T>) {
  const deltas: string[] = [];
  let next = await generator.next();
  while (!next.done) {
    deltas.push(next.value);
    next = await generator.next();
  }
  return { deltas, result: next.value };
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request shape', () => {
    it.each(['claude-opus-5-5', 'claude-sonnet-5-5'])(
      'sends adaptive thinking and effort, and no temperature, to %s',
      async (model) => {
        const fetchMock = mockAnthropicApi({ model });

        await createProvider().complete(params({ model, temperature: 0 }));

        const { url, body } = sentRequest(fetchMock);
        expect(url).toContain('https://anthropic.test/v1/messages');
        expect(body.thinking).toEqual({ type: 'adaptive' });
        expect(body.output_config).toEqual({ effort: 'high' });
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('top_p');
        expect(body).not.toHaveProperty('top_k');
      },
    );

    it('keeps temperature and omits thinking and effort on older models', async () => {
      const fetchMock = mockAnthropicApi({ model: 'claude-sonnet-4-20250514' });

      await createProvider().complete(params({ model: 'claude-sonnet-4-20250514' }));

      const { body } = sentRequest(fetchMock);
      expect(body.temperature).toBe(0.3);
      expect(body).not.toHaveProperty('thinking');
      expect(body).not.toHaveProperty('output_config');
      expect(body).not.toHaveProperty('fallbacks');
    });

    it('forwards an explicit temperature to older models', async () => {
      const fetchMock = mockAnthropicApi({ model: 'claude-sonnet-4-20250514' });

      await createProvider().complete(
        params({ model: 'claude-sonnet-4-20250514', temperature: 0 }),
      );

      expect(sentRequest(fetchMock).body.temperature).toBe(0);
    });

    it('defaults max_tokens to 16000 and effort to high', async () => {
      const fetchMock = mockAnthropicApi();

      await createProvider().complete(params());

      const { body } = sentRequest(fetchMock);
      expect(body.max_tokens).toBe(16000);
      expect(body.output_config).toEqual({ effort: 'high' });
    });

    it('reads effort and max tokens from the environment', async () => {
      const fetchMock = mockAnthropicApi();

      await createProvider({ AI_EFFORT: 'medium', AI_MAX_OUTPUT_TOKENS: '32000' }).complete(
        params(),
      );

      const { body } = sentRequest(fetchMock);
      expect(body.max_tokens).toBe(32000);
      expect(body.output_config).toEqual({ effort: 'medium' });
    });

    it('lets the call override effort and max tokens', async () => {
      const fetchMock = mockAnthropicApi();

      await createProvider({ AI_EFFORT: 'medium' }).complete(
        params({ effort: 'low', maxTokens: 4000 }),
      );

      const { body } = sentRequest(fetchMock);
      expect(body.max_tokens).toBe(4000);
      expect(body.output_config).toEqual({ effort: 'low' });
    });

    it('rejects an invalid AI_EFFORT at construction', () => {
      expect(() => createProvider({ AI_EFFORT: 'extreme' })).toThrow(/AI_EFFORT="extreme"/);
    });

    it('caches the system prompt and keeps it out of messages', async () => {
      const fetchMock = mockAnthropicApi();

      await createProvider().complete(params());

      const { body } = sentRequest(fetchMock);
      expect(body.system).toEqual([
        { type: 'text', text: 'System prompt estável', cache_control: { type: 'ephemeral' } },
      ]);
      expect(body.messages).toEqual([{ role: 'user', content: 'Caso clínico' }]);
    });

    describe('structured outputs', () => {
      it('merges the JSON schema format with effort when the model supports it', async () => {
        const fetchMock = mockAnthropicApi({ model: 'claude-sonnet-5-5' });

        await createProvider().complete(
          params({ model: 'claude-sonnet-5-5', responseSchema: RESPONSE_SCHEMA }),
        );

        expect(sentRequest(fetchMock).body.output_config).toEqual({
          effort: 'high',
          format: { type: 'json_schema', schema: RESPONSE_SCHEMA.schema },
        });
      });

      it('omits the format on models without structured outputs', async () => {
        const fetchMock = mockAnthropicApi({ model: 'claude-sonnet-4-20250514' });

        await createProvider().complete(
          params({ model: 'claude-sonnet-4-20250514', responseSchema: RESPONSE_SCHEMA }),
        );

        expect(sentRequest(fetchMock).body).not.toHaveProperty('output_config');
      });

      it('omits the format when the caller sends no schema', async () => {
        const fetchMock = mockAnthropicApi();

        await createProvider().complete(params());

        expect(sentRequest(fetchMock).body.output_config).toEqual({ effort: 'high' });
      });
    });

    describe('refusal fallback', () => {
      it.each(['claude-opus-5-5', 'claude-sonnet-5-5'])(
        'requests the default server-side fallback on %s',
        async (model) => {
          const fetchMock = mockAnthropicApi({ model });

          await createProvider().complete(params({ model }));

          const { body, headers } = sentRequest(fetchMock);
          expect(body.fallbacks).toBe('default');
          expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
        },
      );

      it('skips the fallback when AI_REFUSAL_FALLBACK=off', async () => {
        const fetchMock = mockAnthropicApi();

        await createProvider({ AI_REFUSAL_FALLBACK: 'off' }).complete(params());

        const { body, headers } = sentRequest(fetchMock);
        expect(body).not.toHaveProperty('fallbacks');
        expect(headers.get('anthropic-beta')).toBeNull();
      });

      it('skips the fallback on models without server-side fallback', async () => {
        const fetchMock = mockAnthropicApi({ model: 'claude-haiku-5-5' });

        await createProvider().complete(params({ model: 'claude-haiku-5-5' }));

        expect(sentRequest(fetchMock).body).not.toHaveProperty('fallbacks');
      });
    });
  });

  describe('complete', () => {
    it('returns only the text blocks, skipping thinking', async () => {
      mockAnthropicApi({
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '{"answer":' },
          { type: 'text', text: '"ok"}' },
        ],
      });

      const result = await createProvider().complete(params());

      expect(result.content).toBe('{"answer":"ok"}');
      expect(result.model).toBe('claude-opus-5-5');
    });

    it('counts cache reads and writes as part of the prompt', async () => {
      mockAnthropicApi({
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 3000,
          cache_creation_input_tokens: 200,
        },
      });

      const result = await createProvider().complete(params());

      expect(result.usage).toEqual({
        promptTokens: 3300,
        completionTokens: 50,
        totalTokens: 3350,
        cacheReadTokens: 3000,
        cacheWriteTokens: 200,
      });
    });

    it('throws AiRefusalError carrying the stop_details category', async () => {
      mockAnthropicApi({
        content: [],
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: 'bio', explanation: 'declined' },
      });

      const error = await createProvider()
        .complete(params())
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiRefusalError);
      expect((error as AiRefusalError).details).toMatchObject({
        model: 'claude-opus-5-5',
        category: 'bio',
        explanation: 'declined',
      });
    });

    it('throws AiTruncatedError when the output hits max_tokens', async () => {
      mockAnthropicApi({
        content: [{ type: 'text', text: '{"answer":' }],
        stopReason: 'max_tokens',
      });

      const error = await createProvider()
        .complete(params({ maxTokens: 1000 }))
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiTruncatedError);
      expect((error as AiTruncatedError).details.maxTokens).toBe(1000);
    });

    it('keeps only the fallback model text after a mid-output refusal', async () => {
      mockAnthropicApi({
        model: 'claude-opus-5',
        content: [
          { type: 'text', text: '{"answer":"par' },
          {
            type: 'fallback',
            from: { model: 'claude-opus-5-5' },
            to: { model: 'claude-opus-5' },
            trigger: { type: 'refusal', category: 'bio' },
          },
          { type: 'text', text: '{"answer":"ok"}' },
        ],
        iterations: [{ type: 'message' }, { type: 'fallback_message' }],
      });

      const result = await createProvider().complete(params());

      expect(result.content).toBe('{"answer":"ok"}');
      expect(result.model).toBe('claude-opus-5');
    });

    it('rethrows the SDK typed error for API failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'invalid_request_error', message: 'bad request' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      );

      await expect(createProvider().complete(params())).rejects.toBeInstanceOf(
        Anthropic.BadRequestError,
      );
    });
  });

  describe('completeStream', () => {
    it('yields text deltas and returns model, usage and stop reason', async () => {
      mockAnthropicApi({
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: 'Olá' },
          { type: 'text', text: ' médico' },
        ],
        usage: { input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 90 },
      });

      const { deltas, result } = await drain(createProvider().completeStream(params()));

      expect(deltas).toEqual(['Olá', ' médico']);
      expect(result).toEqual({
        content: 'Olá médico',
        model: 'claude-opus-5-5',
        stopReason: 'end_turn',
        usage: {
          promptTokens: 100,
          completionTokens: 7,
          totalTokens: 107,
          cacheReadTokens: 90,
          cacheWriteTokens: 0,
        },
      });
    });

    it('throws AiRefusalError when the stream ends in a refusal', async () => {
      mockAnthropicApi({
        content: [{ type: 'text', text: 'parcial' }],
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: 'cyber', explanation: null },
      });

      await expect(drain(createProvider().completeStream(params()))).rejects.toBeInstanceOf(
        AiRefusalError,
      );
    });
  });

  // CC-107 — o motivo decide se a etapa vai para o modelo de reserva.
  describe('anthropicUnavailabilityOf', () => {
    function apiError(status: number | undefined, type: string, message: string) {
      const body = { type: 'error', error: { type, message } };
      return status === undefined
        ? new Anthropic.APIError(undefined, body, undefined, new Headers(), type as never)
        : Anthropic.APIError.generate(status, body, undefined, new Headers());
    }

    it.each([
      [apiError(429, 'rate_limit_error', 'slow down'), 'rate_limit'],
      [apiError(529, 'overloaded_error', 'Overloaded'), 'server_error'],
      [apiError(500, 'api_error', 'Internal'), 'server_error'],
      // Erro no meio do stream (`event: error`): sem status, só o tipo.
      [apiError(undefined, 'overloaded_error', 'Overloaded'), 'server_error'],
      [
        apiError(
          400,
          'invalid_request_error',
          'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.',
        ),
        'usage_limit',
      ],
      [apiError(400, 'invalid_request_error', 'Your credit balance is too low'), 'usage_limit'],
      [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
      [new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'network'],
    ])('treats %o as an outage (%s)', (error, reason) => {
      expect(anthropicUnavailabilityOf(error)).toBe(reason);
    });

    it.each([
      apiError(400, 'invalid_request_error', 'output_config.format: schema is invalid'),
      apiError(401, 'authentication_error', 'invalid x-api-key'),
      apiError(404, 'not_found_error', 'model: claude-x'),
      new Anthropic.APIUserAbortError(),
      new AiRefusalError({
        model: 'claude-opus-5-5',
        category: 'bio',
        explanation: null,
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
      }),
      new Error('qualquer outra coisa'),
    ])('treats %o as a request error, not an outage', (error) => {
      expect(anthropicUnavailabilityOf(error)).toBeNull();
    });
  });
});
