import { describe, it, expect, beforeEach, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AiGatewayService } from './ai-gateway.service';
import { AiEmbeddingsDisabledError } from './ai-gateway.errors';
import { ConfigService } from '@nestjs/config';

function createMockConfig(overrides: Record<string, string> = {}) {
  return new ConfigService({
    AI_PROVIDER: 'anthropic',
    AI_API_KEY: 'test-key',
    AI_BASE_URL: 'https://test.api.com',
    AI_MODEL: 'test-model',
    AI_EMBEDDING_MODEL: 'test-embedding-model',
    ...overrides,
  });
}

/** SSE mínimo do Messages API, no formato que o SDK oficial consome. */
function anthropicSseResponse(texts: string[], model = 'test-model'): Response {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...texts.map((text) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ];
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function mockAnthropicApi(texts: string[] = ['test response']) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(anthropicSseResponse(texts)));
}

function sentAnthropicRequest() {
  const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
  return {
    url: String(url),
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body)) as Record<string, unknown>,
  };
}

function mockFetchResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(''),
  };
}

describe('AiGatewayService', () => {
  let service: AiGatewayService;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockAnthropicApi();

    const config = createMockConfig();
    service = new AiGatewayService(config);
  });

  describe('complete', () => {
    it('delegates to provider with correct params', async () => {
      const messages = [
        { role: 'system' as const, content: 'You are a helper' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = await service.complete({ messages });

      expect(result).toEqual({
        content: 'test response',
        model: 'test-model',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        latencyMs: expect.any(Number),
      });

      const { url, headers } = sentAnthropicRequest();
      expect(url).toContain('https://test.api.com/v1/messages');
      expect(headers.get('x-api-key')).toBe('test-key');
      expect(headers.get('anthropic-version')).toBe('2023-06-01');
    });

    it('uses default model when not specified', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      await service.complete({ messages });

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as Record<string, unknown>;
      expect(body.model).toBe('test-model');
    });

    it('uses custom model when specified', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      await service.complete({ messages, model: 'custom-model' });

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as Record<string, unknown>;
      expect(body.model).toBe('custom-model');
    });

    it('separates system message from other messages for anthropic', async () => {
      const messages = [
        { role: 'system' as const, content: 'System prompt' },
        { role: 'user' as const, content: 'User message' },
      ];

      await service.complete({ messages });

      const { body } = sentAnthropicRequest();
      expect(body.system).toEqual([
        { type: 'text', text: 'System prompt', cache_control: { type: 'ephemeral' } },
      ]);
      expect(body.messages).toEqual([{ role: 'user', content: 'User message' }]);
    });
  });

  describe('provider profiles', () => {
    const GROQ_PROFILE = {
      AI_PROVIDER_PROFILES: 'groq',
      AI_PROVIDER_GROQ_KIND: 'openai',
      AI_PROVIDER_GROQ_API_KEY: 'groq-key',
      AI_PROVIDER_GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
    };

    function mockChatCompletion() {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              model: 'openai/gpt-oss-120b',
              choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
          ),
        ),
      );
    }

    it('sends a "profile:model" reference to that profile, without the prefix', async () => {
      vi.restoreAllMocks();
      const fetchMock = mockChatCompletion();
      const svc = new AiGatewayService(createMockConfig(GROQ_PROFILE));

      const result = await svc.complete({
        model: 'groq:openai/gpt-oss-120b',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer groq-key');
      expect(JSON.parse(String(init?.body)).model).toBe('openai/gpt-oss-120b');
      expect(result.model).toBe('openai/gpt-oss-120b');
    });

    it('keeps references without a profile on the default provider', async () => {
      const svc = new AiGatewayService(createMockConfig(GROQ_PROFILE));

      await svc.complete({
        model: 'claude-sonnet-5-5',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(sentAnthropicRequest().url).toContain('https://test.api.com/v1/messages');
    });

    it('lets AI_MODEL itself point to a profile', async () => {
      vi.restoreAllMocks();
      const fetchMock = mockChatCompletion();
      const svc = new AiGatewayService(
        createMockConfig({ ...GROQ_PROFILE, AI_MODEL: 'groq:openai/gpt-oss-20b' }),
      );

      await svc.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.groq.com');
      expect(svc.getProviderName()).toBe('openai');
      expect(svc.getProviderName('claude-opus-5-5')).toBe('anthropic');
      expect(svc.route()).toMatchObject({ profile: 'groq', model: 'openai/gpt-oss-20b' });
    });

    it('fails at startup when a listed profile is incomplete', () => {
      expect(
        () =>
          new AiGatewayService(createMockConfig({ ...GROQ_PROFILE, AI_PROVIDER_GROQ_API_KEY: '' })),
      ).toThrow(/AI_PROVIDER_GROQ_API_KEY is required/);
    });
  });

  describe('AI_STRUCTURED_OUTPUT', () => {
    const responseSchema = {
      name: 'answer',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
    };

    it('forwards the response schema to the provider by default', async () => {
      await service.complete({
        model: 'claude-sonnet-5-5',
        messages: [{ role: 'user', content: 'Hi' }],
        responseSchema,
      });

      const { body } = sentAnthropicRequest();
      expect(body.output_config).toMatchObject({
        format: { type: 'json_schema', schema: responseSchema.schema },
      });
    });

    it('drops the response schema when AI_STRUCTURED_OUTPUT=false', async () => {
      const svc = new AiGatewayService(createMockConfig({ AI_STRUCTURED_OUTPUT: 'false' }));

      await svc.complete({
        model: 'claude-sonnet-5-5',
        messages: [{ role: 'user', content: 'Hi' }],
        responseSchema,
      });

      const { body } = sentAnthropicRequest();
      expect(body.output_config).not.toHaveProperty('format');
    });
  });

  describe('embed', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: 'test-embedding-model',
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }) as Response,
      );
    });

    it('delegates to provider with correct params', async () => {
      const result = await service.embed(['hello world']);

      expect(result).toEqual({
        embeddings: [[0.1, 0.2, 0.3]],
        model: 'test-embedding-model',
        usage: {
          promptTokens: 5,
          totalTokens: 5,
        },
      });
    });

    it('uses default embedding model when not specified', async () => {
      await service.embed(['test']);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as Record<string, unknown>;
      expect(body.model).toBe('test-embedding-model');
    });

    it('uses custom embedding model when specified', async () => {
      await service.embed(['test'], 'custom-embed-model');

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as Record<string, unknown>;
      expect(body.model).toBe('custom-embed-model');
    });

    it('sends all texts in request body', async () => {
      await service.embed(['text one', 'text two', 'text three']);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as Record<string, unknown>;
      expect(body.input).toEqual(['text one', 'text two', 'text three']);
    });
  });

  describe('provider selection', () => {
    it('selects anthropic provider by default', () => {
      const config = createMockConfig();
      const svc = new AiGatewayService(config);
      expect(svc.getProviderName()).toBe('anthropic');
    });

    it('selects openai provider when configured', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse({
          content: [{ text: 'test response' }],
          model: 'test-model',
          usage: { input_tokens: 10, output_tokens: 20 },
        }) as Response,
      );

      const config = createMockConfig({ AI_PROVIDER: 'openai' });
      const svc = new AiGatewayService(config);
      expect(svc.getProviderName()).toBe('openai');
    });

    it('uses openai completions endpoint when openai provider', async () => {
      // AI_BASE_URL now carries the full versioned prefix (providers differ on
      // where the version segment lives — see openai.provider.ts), so the
      // shared 'https://test.api.com' default (sized for AnthropicProvider,
      // which still appends /v1/messages itself) doesn't apply here.
      const config = createMockConfig({
        AI_PROVIDER: 'openai',
        AI_BASE_URL: 'https://test.api.com/v1',
      });
      const svc = new AiGatewayService(config);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: 'openai response' } }],
          model: 'gpt-4',
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }) as Response,
      );

      const result = await svc.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://test.api.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-key',
          }),
        }),
      );
      expect(result.content).toBe('openai response');
    });

    it('uses openai embeddings endpoint when openai provider', async () => {
      const config = createMockConfig({ AI_PROVIDER: 'openai' });
      const svc = new AiGatewayService(config);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse({
          data: [{ embedding: [0.4, 0.5] }],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }) as Response,
      );

      await svc.embed(['test']);

      // No EMBEDDING_BASE_URL override here — the embedding provider must fall
      // through to OpenAIProvider's own hardcoded default, *not* inherit the
      // completion provider's AI_BASE_URL (that cross-slot leak was the bug:
      // an embedding call would silently go to whatever host the completion
      // model happened to be configured for).
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-key',
          }),
        }),
      );
    });
  });

  // 11/10/2026: sem crédito na OpenAI e sem API de embedding na Anthropic,
  // o serviço passa a rodar sem embeddings.
  describe('EMBEDDING_PROVIDER=none', () => {
    it('desliga os embeddings sem nenhuma chamada de rede', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const svc = new AiGatewayService(createMockConfig({ EMBEDDING_PROVIDER: 'none' }));

      expect(svc.embeddingsEnabled()).toBe(false);
      expect(svc.getEmbeddingProviderName()).toBe('none');
      await expect(svc.embed(['caso'])).rejects.toBeInstanceOf(AiEmbeddingsDisabledError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('mantém os embeddings ligados com qualquer outro provedor', () => {
      expect(new AiGatewayService(createMockConfig()).embeddingsEnabled()).toBe(true);
    });
  });

  describe('PERF-003: decoupled embedding provider', () => {
    it('uses openai for embeddings when completion is anthropic', async () => {
      const config = createMockConfig({
        AI_PROVIDER: 'anthropic',
        OPENAI_API_KEY: 'openai-embed-key',
      });
      const svc = new AiGatewayService(config);

      expect(svc.getProviderName()).toBe('anthropic');
      expect(svc.getEmbeddingProviderName()).toBe('openai');
    });

    it('uses EMBEDDING_API_KEY for embeddings when set', async () => {
      const config = createMockConfig({
        AI_PROVIDER: 'anthropic',
        EMBEDDING_API_KEY: 'dedicated-embed-key',
        EMBEDDING_BASE_URL: 'https://embed.api.com/v1',
      });
      const svc = new AiGatewayService(config);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse({
          data: [{ embedding: [0.1] }],
          model: 'test-embedding-model',
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }) as Response,
      );

      await svc.embed(['test']);

      expect(fetch).toHaveBeenCalledWith(
        'https://embed.api.com/v1/embeddings',
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer dedicated-embed-key' }),
        }),
      );
    });

    it('keeps same provider for both when AI_PROVIDER=openai', () => {
      const config = createMockConfig({ AI_PROVIDER: 'openai' });
      const svc = new AiGatewayService(config);

      expect(svc.getProviderName()).toBe('openai');
      expect(svc.getEmbeddingProviderName()).toBe('openai');
    });
  });

  describe('RT-001: completeStream', () => {
    function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          for (const line of lines) {
            controller.enqueue(encoder.encode(line + '\n'));
          }
          controller.close();
        },
      });
    }

    it('yields text deltas from anthropic streaming response', async () => {
      mockAnthropicApi(['Hello', ' world']);
      const svc = new AiGatewayService(createMockConfig({ AI_PROVIDER: 'anthropic' }));

      const chunks: string[] = [];
      for await (const delta of svc.completeStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(delta);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('returns the provider usage as the generator return value', async () => {
      mockAnthropicApi(['Hello']);
      const svc = new AiGatewayService(createMockConfig({ AI_PROVIDER: 'anthropic' }));
      const stream = svc.completeStream({ messages: [{ role: 'user', content: 'Hi' }] });

      let next = await stream.next();
      while (!next.done) next = await stream.next();

      expect(next.value).toEqual({
        content: 'Hello',
        model: 'test-model',
        stopReason: 'end_turn',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      });
    });

    it('yields text deltas from openai streaming response', async () => {
      const config = createMockConfig({ AI_PROVIDER: 'openai' });
      const svc = new AiGatewayService(config);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        body: makeSseStream([
          'data: {"choices":[{"delta":{"content":"Oi"},"finish_reason":null}]}',
          'data: {"choices":[{"delta":{"content":" médico"},"finish_reason":null}]}',
          'data: [DONE]',
        ]),
      } as unknown as Response);

      const chunks: string[] = [];
      for await (const delta of svc.completeStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(delta);
      }

      expect(chunks).toEqual(['Oi', ' médico']);
    });

    it('throws the SDK typed error when the anthropic stream fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'rate_limit_error', message: 'slow down' },
          }),
          // x-should-retry: false keeps the SDK from backing off inside the test.
          {
            status: 429,
            headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
          },
        ),
      );
      const svc = new AiGatewayService(createMockConfig({ AI_PROVIDER: 'anthropic' }));

      await expect(async () => {
        for await (const _ of svc.completeStream({ messages: [{ role: 'user', content: 'Hi' }] })) {
          // consume
        }
      }).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    });

    it('throws when the openai stream response is not ok', async () => {
      const svc = new AiGatewayService(
        createMockConfig({ AI_PROVIDER: 'openai', AI_REQUEST_MAX_RETRIES: '0' }),
      );

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('rate limited', { status: 429 }),
      );

      await expect(async () => {
        for await (const _ of svc.completeStream({ messages: [{ role: 'user', content: 'Hi' }] })) {
          // consume
        }
      }).rejects.toThrow('AI provider error: 429');
    });
  });

  describe('logging', () => {
    it('logs completion request metadata', async () => {
      const debugCalls: Array<string> = [];
      const config = createMockConfig();
      const svc = new AiGatewayService(config);

      const internalLogger = (svc as unknown as { logger: { debug: (msg: string) => void } })
        .logger;
      const originalDebug = internalLogger.debug.bind(internalLogger);
      internalLogger.debug = (msg: string) => {
        debugCalls.push(msg);
        originalDebug(msg);
      };

      await svc.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(debugCalls).toContainEqual(
        expect.stringContaining('Completion request: model=test-model, messages=1'),
      );
      expect(debugCalls).toContainEqual(expect.stringContaining('Completion response:'));
    });
  });
});
