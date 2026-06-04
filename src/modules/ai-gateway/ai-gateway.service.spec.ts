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
      const config = createMockConfig({ AI_PROVIDER: 'openai' });
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

      expect(fetch).toHaveBeenCalledWith(
        'https://test.api.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-key',
          }),
        }),
      );
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
      expect(debugCalls).toContainEqual(
        expect.stringContaining('Completion response:'),
      );
    });
  });
});
