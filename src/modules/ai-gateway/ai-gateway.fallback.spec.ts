import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../config/prisma.service';
import { runWithRequestContext } from '../../shared/request-context/request-context';
import { AiGatewayService, type GatewayCompletionParams } from './ai-gateway.service';
import { AiCallLogService } from './ai-call-log.service';
import { AiProviderError, AiRefusalError } from './ai-gateway.errors';
import type { AiCallTrace } from './ai-call-trace';

/**
 * CC-107 — reserva de provedor. Os provedores são os reais; só o `fetch` é
 * falso: a Groq (perfil `groq`) em groq.test e a Anthropic (padrão) em
 * anthropic.test.
 */
const GROQ_HOST = 'https://groq.test/v1';
const ANTHROPIC_HOST = 'https://anthropic.test';
const CASE_TEXT = 'Maria da Silva, 54 anos, dor torácica há 2 horas';

function config(overrides: Record<string, string> = {}) {
  return new ConfigService({
    AI_PROVIDER: 'anthropic',
    AI_API_KEY: 'anthropic-key',
    AI_BASE_URL: ANTHROPIC_HOST,
    AI_MODEL: 'claude-opus-5-5',
    AI_EMBEDDING_MODEL: 'text-embedding-3-small',
    AI_PROVIDER_PROFILES: 'groq',
    AI_PROVIDER_GROQ_KIND: 'openai',
    AI_PROVIDER_GROQ_API_KEY: 'groq-key',
    AI_PROVIDER_GROQ_BASE_URL: GROQ_HOST,
    // Sem novas tentativas: o teste mede a reserva, não o retry do provedor.
    AI_REQUEST_MAX_RETRIES: '0',
    AI_FALLBACK_MODEL: 'claude-sonnet-5-5',
    ...overrides,
  });
}

const params: GatewayCompletionParams = {
  model: 'groq:openai/gpt-oss-120b',
  stage: 'understanding',
  messages: [
    { role: 'system', content: 'Entenda o caso' },
    { role: 'user', content: CASE_TEXT },
  ],
};

/** SSE mínimo do Messages API, no formato que o SDK oficial consome. */
function anthropicStream(
  texts: string[],
  model = 'claude-sonnet-5-5',
  stopReason = 'end_turn',
): Response {
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
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ];
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** Erro da Anthropic sem nova tentativa do SDK (`x-should-retry: false`). */
function anthropicError(status: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  });
}

function groqError(status: number, code = 'x'): Response {
  return new Response(
    JSON.stringify({ error: { message: `falhou: ${CASE_TEXT}`, type: 'x', code } }),
    { status },
  );
}

function groqCompletion(overrides: { finishReason?: string } = {}): Response {
  return new Response(
    JSON.stringify({
      model: 'openai/gpt-oss-120b',
      choices: [
        { message: { content: '{"ok":"groq"}' }, finish_reason: overrides.finishReason ?? 'stop' },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  );
}

/** Stream da Groq que entrega um delta e cai (conexão cortada) no pedido seguinte. */
function groqStreamCutAfterFirstDelta(): Response {
  const encoder = new TextEncoder();
  let pulls = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          const chunk = { model: 'openai/gpt-oss-120b', choices: [{ delta: { content: '{"a"' } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          return;
        }
        controller.error(new TypeError('terminated'));
      },
    }),
  );
}

/** Não responde até o prazo do provedor abortar a requisição. */
function hangUntilAborted(init: RequestInit | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

type Responder = (init: RequestInit | undefined) => Response | Promise<Response>;

function mockHosts(hosts: { groq?: Responder; anthropic?: Responder }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const responder = url.startsWith(GROQ_HOST) ? hosts.groq : hosts.anthropic;
    if (!responder) throw new Error(`unexpected request to ${url}`);
    return Promise.resolve(responder(init));
  });
}

function hostsCalled(fetchMock: ReturnType<typeof mockHosts>): string[] {
  return fetchMock.mock.calls.map(([input]) =>
    String(input instanceof Request ? input.url : input).startsWith(GROQ_HOST)
      ? 'groq'
      : 'anthropic',
  );
}

function gateway(overrides: Record<string, string> = {}) {
  const traces: AiCallTrace[] = [];
  const svc = new AiGatewayService(config(overrides), { record: (trace) => traces.push(trace) });
  const logger = (svc as unknown as { logger: Record<'warn' | 'error', (m: string) => void> })
    .logger;
  const logged: string[] = [];
  logger.warn = (message: string) => logged.push(message);
  logger.error = (message: string) => logged.push(message);
  return { svc, traces, logged };
}

async function drain<Result>(stream: AsyncGenerator<string, Result>) {
  const deltas: string[] = [];
  let next = await stream.next();
  while (!next.done) {
    deltas.push(next.value);
    next = await stream.next();
  }
  return { deltas, result: next.value };
}

describe('AiGatewayService — reserva de provedor (CC-107)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('complete', () => {
    it.each([
      ['a 5xx', () => groqError(503), 'server_error', 'AiProviderError:503'],
      ['a 429 after the retries', () => groqError(429), 'rate_limit', 'AiProviderError:429'],
      [
        'the usage quota',
        () => groqError(429, 'insufficient_quota'),
        'usage_limit',
        'AiProviderError:429',
      ],
    ])('falls back to the reserve model on %s', async (_label, failure, reason, errorType) => {
      const fetchMock = mockHosts({
        groq: failure,
        anthropic: () => anthropicStream(['{"ok":"claude"}']),
      });
      const { svc, traces, logged } = gateway();

      const result = await svc.complete(params);

      expect(result).toMatchObject({ content: '{"ok":"claude"}', model: 'claude-sonnet-5-5' });
      expect(hostsCalled(fetchMock)).toEqual(['groq', 'anthropic']);
      expect(traces).toEqual([
        expect.objectContaining({
          stage: 'understanding',
          profile: 'groq',
          requestedModel: 'openai/gpt-oss-120b',
          outcome: 'error',
          errorType,
          fallbackFrom: null,
        }),
        expect.objectContaining({
          stage: 'understanding',
          profile: 'default',
          requestedModel: 'claude-sonnet-5-5',
          servedModel: 'claude-sonnet-5-5',
          outcome: 'ok',
          fallbackFrom: 'groq',
        }),
      ]);
      expect(logged).toContain(
        `AI_FALLBACK stage=understanding from=groq fromModel=openai/gpt-oss-120b to=default ` +
          `toModel=claude-sonnet-5-5 reason=${reason} error=${errorType} requestId=-`,
      );
    });

    it('falls back when the provider passes its deadline', async () => {
      mockHosts({ groq: hangUntilAborted, anthropic: () => anthropicStream(['{"ok":"claude"}']) });
      const { svc, traces } = gateway({ AI_REQUEST_TIMEOUT_MS: '20' });

      const result = await svc.complete(params);

      expect(result.content).toBe('{"ok":"claude"}');
      expect(traces.map(({ errorType }) => errorType)).toEqual(['AiProviderError:timeout', null]);
    });

    it('falls back from an Anthropic stage blocked by the workspace usage limit', async () => {
      const fetchMock = mockHosts({
        anthropic: () =>
          anthropicError(
            400,
            'invalid_request_error',
            'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.',
          ),
        groq: () => groqCompletion(),
      });
      const { svc, logged } = gateway({
        AI_FALLBACK_MODEL: '',
        AI_DECISION_FALLBACK_MODEL: 'groq:openai/gpt-oss-120b',
      });

      const result = await svc.complete({ ...params, model: 'claude-opus-5-5', stage: 'decision' });

      expect(result.content).toBe('{"ok":"groq"}');
      expect(hostsCalled(fetchMock)).toEqual(['anthropic', 'groq']);
      expect(logged.join('\n')).toContain('AI_FALLBACK stage=decision from=default');
      expect(logged.join('\n')).toContain('reason=usage_limit');
    });

    it('does not fall back on a request error (400)', async () => {
      const fetchMock = mockHosts({ groq: () => groqError(400) });
      const { svc, traces } = gateway();

      await expect(svc.complete(params)).rejects.toMatchObject({
        message: 'AI provider error: 400',
      });
      expect(hostsCalled(fetchMock)).toEqual(['groq']);
      expect(traces).toHaveLength(1);
    });

    it('does not fall back on a refusal', async () => {
      const fetchMock = mockHosts({
        groq: () => groqCompletion({ finishReason: 'content_filter' }),
      });
      const { svc } = gateway();

      await expect(svc.complete(params)).rejects.toBeInstanceOf(AiRefusalError);
      expect(hostsCalled(fetchMock)).toEqual(['groq']);
    });

    it('rethrows the original error when the reserve also fails', async () => {
      mockHosts({
        groq: () => groqError(503),
        anthropic: () => anthropicError(529, 'overloaded_error', 'Overloaded'),
      });
      const { svc, traces, logged } = gateway();

      const error = await svc.complete(params).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiProviderError);
      expect(error).toMatchObject({ message: 'AI provider error: 503' });
      expect(traces.map(({ profile, outcome }) => `${profile}:${outcome}`)).toEqual([
        'groq:error',
        'default:error',
      ]);
      expect(logged.at(-1)).toBe(
        'AI_FALLBACK_FAILED stage=understanding from=groq to=default toModel=claude-sonnet-5-5 ' +
          'original=AiProviderError:503 error=InternalServerError:529 requestId=-',
      );
    });

    it('keeps a refusal from the reserve, which the caller accounts for', async () => {
      mockHosts({
        groq: () => groqError(503),
        anthropic: () => anthropicStream([], 'claude-sonnet-5-5', 'refusal'),
      });
      const { svc } = gateway({ AI_REFUSAL_FALLBACK: 'off' });

      await expect(svc.complete(params)).rejects.toBeInstanceOf(AiRefusalError);
    });

    it('changes nothing without a reserve model', async () => {
      const fetchMock = mockHosts({ groq: () => groqError(503) });
      const { svc, traces, logged } = gateway({ AI_FALLBACK_MODEL: '' });

      await expect(svc.complete(params)).rejects.toMatchObject({
        message: 'AI provider error: 503',
      });
      expect(hostsCalled(fetchMock)).toEqual(['groq']);
      expect(traces).toHaveLength(1);
      expect(logged).toEqual([]);
    });

    it('never falls back to the profile that went down', async () => {
      const fetchMock = mockHosts({ groq: () => groqError(503) });
      const { svc, logged } = gateway({ AI_FALLBACK_MODEL: 'groq:llama-3.3-70b-versatile' });

      await expect(svc.complete(params)).rejects.toBeInstanceOf(AiProviderError);
      expect(hostsCalled(fetchMock)).toEqual(['groq']);
      expect(logged[0]).toMatch(/^AI_FALLBACK_SKIPPED .*: reserva no mesmo perfil que caiu$/);
    });

    it('prefers the stage reserve over the general one, and "none" turns a stage off', async () => {
      mockHosts({
        groq: () => groqError(503),
        anthropic: () => anthropicStream(['{}'], 'claude-haiku-5-5'),
      });
      const { svc, traces } = gateway({ AI_UNDERSTANDING_FALLBACK_MODEL: 'claude-haiku-5-5' });

      await svc.complete(params);
      await expect(
        gateway({ AI_INTAKE_FALLBACK_MODEL: 'none' }).svc.complete({
          ...params,
          stage: 'intake_reading',
        }),
      ).rejects.toBeInstanceOf(AiProviderError);

      expect(traces[1]).toMatchObject({ requestedModel: 'claude-haiku-5-5', fallbackFrom: 'groq' });
    });

    it('stores both calls in ai_calls under the same request id, with no case text', async () => {
      mockHosts({ groq: () => groqError(503), anthropic: () => anthropicStream(['{}']) });
      const create = vi.fn().mockResolvedValue({});
      const callLog = new AiCallLogService({ aiCall: { create } } as unknown as PrismaService);
      vi.spyOn((callLog as unknown as { logger: { log: () => void } }).logger, 'log');
      const svc = new AiGatewayService(config(), callLog);
      const warn = vi.spyOn((svc as unknown as { logger: { warn: () => void } }).logger, 'warn');

      await runWithRequestContext(
        { requestId: 'req-cc107-0001', physicianId: null, encounterId: null },
        () => svc.complete(params),
      );

      expect(create.mock.calls.map(([{ data }]) => data)).toEqual([
        expect.objectContaining({
          requestId: 'req-cc107-0001',
          profile: 'groq',
          outcome: 'error',
          fallbackFrom: null,
        }),
        expect.objectContaining({
          requestId: 'req-cc107-0001',
          profile: 'default',
          outcome: 'ok',
          fallbackFrom: 'groq',
        }),
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('requestId=req-cc107-0001'));
      const written = JSON.stringify([create.mock.calls, warn.mock.calls]);
      expect(written).not.toContain('Maria');
    });
  });

  describe('completeStream', () => {
    it('falls back when the stream fails before the first delta', async () => {
      const fetchMock = mockHosts({
        groq: () => groqError(502),
        anthropic: () => anthropicStream(['{"ok"', ':"claude"}']),
      });
      const { svc, traces } = gateway();

      const { deltas, result } = await drain(svc.completeStream({ ...params, stage: 'decision' }));

      expect(deltas).toEqual(['{"ok"', ':"claude"}']);
      expect(result).toMatchObject({ content: '{"ok":"claude"}', model: 'claude-sonnet-5-5' });
      expect(hostsCalled(fetchMock)).toEqual(['groq', 'anthropic']);
      expect(
        traces.map(({ profile, outcome, fallbackFrom }) => [profile, outcome, fallbackFrom]),
      ).toEqual([
        ['groq', 'error', null],
        ['default', 'ok', 'groq'],
      ]);
    });

    it('does not switch models once a delta went out', async () => {
      const fetchMock = mockHosts({ groq: groqStreamCutAfterFirstDelta });
      const { svc, logged } = gateway();
      const deltas: string[] = [];

      const error = await (async () => {
        for await (const delta of svc.completeStream({ ...params, stage: 'decision' })) {
          deltas.push(delta);
        }
      })().catch((caught: unknown) => caught);

      expect(deltas).toEqual(['{"a"']);
      expect(error).toMatchObject({ details: { unavailability: 'network' } });
      expect(hostsCalled(fetchMock)).toEqual(['groq']);
      expect(logged[0]).toMatch(
        /^AI_FALLBACK_SKIPPED stage=decision .*: o stream já tinha começado$/,
      );
    });

    it('closes the primary stream when the consumer leaves early', async () => {
      mockHosts({ anthropic: () => anthropicStream(['a', 'b', 'c']) });
      const { svc, traces } = gateway();

      const stream = svc.completeStream({ ...params, model: 'claude-opus-5-5', stage: 'decision' });
      await stream.next();
      await stream.return(undefined as never);

      expect(traces).toEqual([expect.objectContaining({ outcome: 'aborted' })]);
    });
  });
});
