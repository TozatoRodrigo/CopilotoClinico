import { describe, expect, it, vi } from 'vitest';
import { AiRefusalError } from './ai-gateway.errors';
import type { AiCallTrace } from './ai-call-trace';
import { TracingAiProvider } from './tracing-provider';
import type {
  AIProvider,
  CompletionParams,
  ResearchParams,
  StreamCompletionResult,
} from './providers/provider.interface';

const usage = { promptTokens: 100, completionTokens: 20, totalTokens: 120 };

const params: CompletionParams = {
  model: 'claude-opus-5-5',
  stage: 'decision',
  effort: 'high',
  messages: [
    { role: 'system', content: 'Regras da decisão v3' },
    { role: 'user', content: 'Maria da Silva, 54 anos, dor torácica' },
  ],
  responseSchema: { name: 'copilot_output', schema: {} },
};

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: 'anthropic',
    complete: vi
      .fn()
      .mockResolvedValue({ content: '{}', model: 'claude-opus-5-5', usage, latencyMs: 5 }),
    completeStream: vi.fn(),
    embed: vi.fn(),
    research: vi.fn(),
    ...overrides,
  };
}

function traced(inner: AIProvider) {
  const traces: AiCallTrace[] = [];
  return {
    traces,
    tracing: new TracingAiProvider(inner, 'default', { record: (t) => traces.push(t) }),
  };
}

describe('TracingAiProvider', () => {
  it('records a successful call with metadata only', async () => {
    const { traces, tracing } = traced(provider());

    await tracing.complete(params);

    expect(traces).toEqual([
      expect.objectContaining({
        stage: 'decision',
        profile: 'default',
        provider: 'anthropic',
        requestedModel: 'claude-opus-5-5',
        servedModel: 'claude-opus-5-5',
        effort: 'high',
        responseSchema: 'copilot_output',
        usage,
        outcome: 'ok',
        errorType: null,
        fallbackFrom: null,
      }),
    ]);
    expect(traces[0]?.promptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(traces)).not.toContain('Maria');
    expect(JSON.stringify(traces)).not.toContain('Regras');
  });

  it('marks a call on the reserve model with the profile that went down', async () => {
    const { traces, tracing } = traced(provider());

    await tracing.complete({ ...params, fallbackFrom: 'groq' });

    expect(traces[0]).toMatchObject({ fallbackFrom: 'groq', outcome: 'ok' });
  });

  it('fingerprints only the system prompt: same rules, same hash, whatever the case', async () => {
    const { traces, tracing } = traced(provider());

    await tracing.complete(params);
    await tracing.complete({
      ...params,
      messages: [params.messages[0]!, { role: 'user', content: 'Outro caso' }],
    });

    expect(traces[0]?.promptSha256).toBe(traces[1]?.promptSha256);
  });

  it('records a refusal with its usage and rethrows', async () => {
    const refusal = new AiRefusalError({
      model: 'claude-opus-5-5',
      category: 'bio',
      explanation: null,
      usage,
    });
    const { traces, tracing } = traced(provider({ complete: vi.fn().mockRejectedValue(refusal) }));

    await expect(tracing.complete(params)).rejects.toBe(refusal);

    expect(traces[0]).toMatchObject({ outcome: 'refusal', usage, servedModel: 'claude-opus-5-5' });
  });

  it('records the error class and HTTP status, never the message', async () => {
    const error = Object.assign(new Error('Paciente Maria: rate limited'), {
      name: 'RateLimitError',
      status: 429,
    });
    const { traces, tracing } = traced(provider({ complete: vi.fn().mockRejectedValue(error) }));

    await expect(tracing.complete(params)).rejects.toBe(error);

    expect(traces[0]).toMatchObject({
      outcome: 'error',
      errorType: 'RateLimitError:429',
      usage: null,
    });
    expect(JSON.stringify(traces)).not.toContain('Maria');
  });

  it('records a stream when it finishes and when the consumer leaves early', async () => {
    async function* stream(): AsyncGenerator<string, StreamCompletionResult> {
      yield '{"a"';
      yield ':1}';
      return { content: '{"a":1}', model: 'claude-opus-5-5', usage, stopReason: 'end_turn' };
    }
    const { traces, tracing } = traced(provider({ completeStream: vi.fn(() => stream()) }));

    for await (const _ of tracing.completeStream(params)) {
      // consome tudo
    }
    const early = tracing.completeStream(params);
    await early.next();
    await early.return(undefined as never);

    expect(traces.map(({ outcome }) => outcome)).toEqual(['ok', 'aborted']);
  });

  it('labels research calls as research by default', async () => {
    const research = vi.fn().mockResolvedValue({
      text: '',
      citations: [],
      model: 'claude-sonnet-5-5',
      usage,
      latencyMs: 1,
      continuations: 0,
      stopReason: null,
    });
    const { traces, tracing } = traced(provider({ research }));

    await tracing.research({
      model: 'claude-sonnet-5-5',
      system: 'Pesquise',
      prompt: 'AVC',
    } as ResearchParams);

    expect(traces[0]).toMatchObject({ stage: 'research', outcome: 'ok', responseSchema: null });
  });

  it('never lets a failing sink break the call', async () => {
    const tracing = new TracingAiProvider(provider(), 'default', {
      record: () => {
        throw new Error('sink down');
      },
    });

    await expect(tracing.complete(params)).resolves.toMatchObject({ content: '{}' });
  });
});
