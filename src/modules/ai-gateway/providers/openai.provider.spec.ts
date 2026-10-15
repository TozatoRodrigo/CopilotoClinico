import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from './openai.provider';
import { AiRefusalError, AiTruncatedError } from '../ai-gateway.errors';
import type { CompletionParams, JsonResponseSchema } from './provider.interface';

const RESPONSE_SCHEMA: JsonResponseSchema = {
  name: 'answer',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  },
};

function chatCompletion(overrides: { finishReason?: string; refusal?: string | null } = {}) {
  return {
    model: 'gpt-4o-2024-08-06',
    choices: [
      {
        message: { content: '{"answer":"ok"}', refusal: overrides.refusal ?? null },
        finish_reason: overrides.finishReason ?? 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1200,
      completion_tokens: 30,
      total_tokens: 1230,
      prompt_tokens_details: { cached_tokens: 1024 },
    },
  };
}

function mockJson(payload: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload))));
}

function mockSse(chunks: unknown[]) {
  const body = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`), 'data: [DONE]']
    .map((line) => `${line}\n\n`)
    .join('');
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response(body)));
}

function sentBody(fetchMock: ReturnType<typeof mockJson>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}

function createProvider(env: Record<string, string> = {}) {
  return new OpenAIProvider(new ConfigService({ AI_API_KEY: 'test-key', ...env }), {
    apiKey: 'test-key',
    baseUrl: 'https://openai.test/v1',
  });
}

function params(overrides: Partial<CompletionParams> = {}): CompletionParams {
  return {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Caso' },
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

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('request shape', () => {
    it('sends temperature and the default output cap to non-reasoning models', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createProvider({ AI_REASONING_EFFORT: 'high' }).complete(params());

      const body = sentBody(fetchMock);
      expect(body.temperature).toBe(0.3);
      expect(body.max_completion_tokens).toBe(16000);
      expect(body).not.toHaveProperty('reasoning_effort');
      expect(body).not.toHaveProperty('response_format');
    });

    it.each(['gpt-5.1', 'gpt-5.6-luna', 'gpt-6.1-sol', 'o4-mini', 'o3'])(
      'sends reasoning_effort and no temperature to %s',
      async (model) => {
        const fetchMock = mockJson(chatCompletion());

        await createProvider({ AI_REASONING_EFFORT: 'high' }).complete(params({ model }));

        const body = sentBody(fetchMock);
        expect(body.reasoning_effort).toBe('high');
        expect(body).not.toHaveProperty('temperature');
      },
    );

    it('omits reasoning_effort when AI_REASONING_EFFORT is empty', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createProvider({ AI_REASONING_EFFORT: '' }).complete(params({ model: 'gpt-5.1' }));

      expect(sentBody(fetchMock)).not.toHaveProperty('reasoning_effort');
    });

    it('rejects an invalid AI_REASONING_EFFORT at construction', () => {
      expect(() => createProvider({ AI_REASONING_EFFORT: 'extreme' })).toThrow(
        /AI_REASONING_EFFORT="extreme"/,
      );
    });

    it('reads the output cap from AI_MAX_OUTPUT_TOKENS and lets the call override it', async () => {
      const fetchMock = mockJson(chatCompletion());
      const provider = createProvider({ AI_MAX_OUTPUT_TOKENS: '8000' });

      await provider.complete(params());
      await provider.complete(params({ maxTokens: 500 }));

      expect(sentBody(fetchMock).max_completion_tokens).toBe(8000);
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).max_completion_tokens).toBe(
        500,
      );
    });

    describe('structured outputs', () => {
      it('stays off by default even when a schema is passed', async () => {
        const fetchMock = mockJson(chatCompletion());

        await createProvider().complete(params({ responseSchema: RESPONSE_SCHEMA }));

        expect(sentBody(fetchMock)).not.toHaveProperty('response_format');
      });

      it('sends a strict json_schema response_format when AI_OPENAI_STRUCTURED_OUTPUT=true', async () => {
        const fetchMock = mockJson(chatCompletion());

        await createProvider({ AI_OPENAI_STRUCTURED_OUTPUT: 'true' }).complete(
          params({ responseSchema: RESPONSE_SCHEMA }),
        );

        expect(sentBody(fetchMock).response_format).toEqual({
          type: 'json_schema',
          json_schema: { name: 'answer', schema: RESPONSE_SCHEMA.schema, strict: true },
        });
      });
    });
  });

  describe('open-weight models and host options', () => {
    function createHostProvider(overrides: Record<string, unknown> = {}, env = {}) {
      return new OpenAIProvider(new ConfigService({ AI_API_KEY: 'test-key', ...env }), {
        apiKey: 'groq-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        ...overrides,
      });
    }

    it('treats gpt-oss as a reasoning model and maps the stage effort to its scale', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createHostProvider().complete(
        params({ model: 'openai/gpt-oss-120b', effort: 'xhigh' }),
      );

      const body = sentBody(fetchMock);
      expect(body.reasoning_effort).toBe('high');
      expect(body).not.toHaveProperty('temperature');
    });

    it('lets the stage effort win over AI_REASONING_EFFORT', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createProvider({ AI_REASONING_EFFORT: 'high' }).complete(
        params({ model: 'gpt-5.1', effort: 'low' }),
      );

      expect(sentBody(fetchMock).reasoning_effort).toBe('low');
    });

    it('sends max_tokens when the host asks for it', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createHostProvider({ maxTokensParam: 'max_tokens' }).complete(params());

      const body = sentBody(fetchMock);
      expect(body.max_tokens).toBe(16000);
      expect(body).not.toHaveProperty('max_completion_tokens');
    });

    it('asks for a JSON object without schema in json_object mode', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createHostProvider({ structuredOutput: 'json_object' }).complete(
        params({ responseSchema: RESPONSE_SCHEMA }),
      );

      expect(sentBody(fetchMock).response_format).toEqual({ type: 'json_object' });
    });

    it('adds the host extra body last, so a repeated field replaces ours', async () => {
      const fetchMock = mockJson(chatCompletion());

      await createHostProvider({
        extraBody: { reasoning_format: 'hidden', temperature: 0.6 },
      }).complete(params());

      expect(sentBody(fetchMock)).toMatchObject({ reasoning_format: 'hidden', temperature: 0.6 });
    });

    it('drops a leading <think> block from the answer', async () => {
      const payload = chatCompletion();
      payload.choices[0]!.message.content = '<think>raciocínio\nlongo</think>\n{"answer":"ok"}';
      mockJson(payload);

      const result = await createHostProvider().complete(params());

      expect(result.content).toBe('{"answer":"ok"}');
    });
  });

  describe('timeouts and retries', () => {
    function sequence(responses: Array<() => Promise<Response>>) {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      for (const response of responses) fetchMock.mockImplementationOnce(response);
      return fetchMock;
    }

    const ok = () => Promise.resolve(new Response(JSON.stringify(chatCompletion())));
    const status =
      (code: number, headers: Record<string, string> = {}) =>
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { message: 'Paciente Maria da Silva, caso completo', type: 'x', code: code },
            }),
            { status: code, headers },
          ),
        );

    it('retries a 429 after the Retry-After delay and returns the answer', async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = sequence([status(429, { 'retry-after': '2' }), ok]);

        const pending = createProvider().complete(params());
        await vi.advanceTimersByTimeAsync(2000);
        const result = await pending;

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.content).toBe('{"answer":"ok"}');
      } finally {
        vi.useRealTimers();
      }
    });

    it('gives up after AI_REQUEST_MAX_RETRIES and logs no body beyond a short message', async () => {
      const fetchMock = sequence([status(503), status(503)]);
      const provider = createProvider({ AI_REQUEST_MAX_RETRIES: '1' });
      const logged: string[] = [];
      const logger = (provider as unknown as { logger: Record<string, (m: string) => void> })
        .logger;
      logger.warn = (message: string) => logged.push(message);
      logger.error = (message: string) => logged.push(message);
      vi.useFakeTimers();
      try {
        const pending = provider.complete(params()).catch((caught: unknown) => caught);
        await vi.advanceTimersByTimeAsync(1000);
        const error = await pending;

        expect(error).toEqual(new Error('AI provider error: 503'));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(logged.at(-1)).toMatch(/^AI_PROVIDER_ERROR operation=API status=503 type=x/);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry a 400', async () => {
      const fetchMock = sequence([status(400)]);

      await expect(createProvider().complete(params())).rejects.toThrow('AI provider error: 400');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('aborts a request that passes AI_REQUEST_TIMEOUT_MS', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      vi.useFakeTimers();
      try {
        const pending = createProvider({
          AI_REQUEST_TIMEOUT_MS: '500',
          AI_REQUEST_MAX_RETRIES: '0',
        })
          .complete(params())
          .catch((caught: unknown) => caught);
        await vi.advanceTimersByTimeAsync(500);

        expect(await pending).toEqual(new Error('AI provider API timeout after 500ms'));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('complete', () => {
    it('maps cached prompt tokens into the usage', async () => {
      mockJson(chatCompletion());

      const result = await createProvider().complete(params());

      expect(result.content).toBe('{"answer":"ok"}');
      expect(result.usage).toEqual({
        promptTokens: 1200,
        completionTokens: 30,
        totalTokens: 1230,
        cacheReadTokens: 1024,
      });
    });

    it('throws AiTruncatedError when finish_reason is length', async () => {
      mockJson(chatCompletion({ finishReason: 'length' }));

      await expect(createProvider().complete(params())).rejects.toBeInstanceOf(AiTruncatedError);
    });

    it('throws AiRefusalError when the model returns a refusal', async () => {
      mockJson(chatCompletion({ refusal: 'I cannot help with that.' }));

      const error = await createProvider()
        .complete(params())
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiRefusalError);
      expect((error as AiRefusalError).details.explanation).toBe('I cannot help with that.');
    });
  });

  describe('completeStream', () => {
    it('asks for usage and returns it with the model and finish reason', async () => {
      const fetchMock = mockSse([
        {
          model: 'gpt-4o-2024-08-06',
          choices: [{ delta: { content: 'Oi' }, finish_reason: null }],
        },
        {
          model: 'gpt-4o-2024-08-06',
          choices: [{ delta: { content: ' médico' }, finish_reason: 'stop' }],
        },
        {
          model: 'gpt-4o-2024-08-06',
          choices: [],
          usage: { prompt_tokens: 50, completion_tokens: 4, total_tokens: 54 },
        },
      ]);

      const { deltas, result } = await drain(createProvider().completeStream(params()));

      expect(sentBody(fetchMock)).toMatchObject({
        stream: true,
        stream_options: { include_usage: true },
      });
      expect(deltas).toEqual(['Oi', ' médico']);
      expect(result).toEqual({
        content: 'Oi médico',
        model: 'gpt-4o-2024-08-06',
        stopReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 4, totalTokens: 54, cacheReadTokens: 0 },
      });
    });

    it('throws AiTruncatedError when the stream finishes by length', async () => {
      mockSse([{ choices: [{ delta: { content: '{"answer":' }, finish_reason: 'length' }] }]);

      await expect(drain(createProvider().completeStream(params()))).rejects.toBeInstanceOf(
        AiTruncatedError,
      );
    });
  });
});
