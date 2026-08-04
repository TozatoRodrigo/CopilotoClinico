import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiGatewayService } from './ai-gateway.service';
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

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        content: [{ text: 'test response' }],
        model: 'test-model',
        usage: { input_tokens: 10, output_tokens: 20 },
      }) as Response,
    );

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
        },
        latencyMs: expect.any(Number),
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://test.api.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );
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

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as Record<string, unknown>;
      expect(body.system).toBe('System prompt');
      expect(body.messages).toEqual([{ role: 'user', content: 'User message' }]);
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
      const config = createMockConfig({ AI_PROVIDER: 'openai', AI_BASE_URL: 'https://test.api.com/v1' });
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
      const config = createMockConfig({ AI_PROVIDER: 'anthropic' });
      const svc = new AiGatewayService(config);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        body: makeSseStream([
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
          'data: [DONE]',
        ]),
      } as unknown as Response);

      const chunks: string[] = [];
      for await (const delta of svc.completeStream({ messages: [{ role: 'user', content: 'Hi' }] })) {
        chunks.push(delta);
      }

      expect(chunks).toEqual(['Hello', ' world']);
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
      for await (const delta of svc.completeStream({ messages: [{ role: 'user', content: 'Hi' }] })) {
        chunks.push(delta);
      }

      expect(chunks).toEqual(['Oi', ' médico']);
    });

    it('throws when stream response is not ok', async () => {
      const config = createMockConfig({ AI_PROVIDER: 'anthropic' });
      const svc = new AiGatewayService(config);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      } as unknown as Response);

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
