import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CompletionUsage } from '../../src/modules/ai-gateway/providers/provider.interface';
import { intakeReadingFixture, intakeReadingWire } from '../../tests/fixtures/intake-reading';
import type { IntakeCase } from './case.schema';
import { SpendGuard } from './guard';
import { MeteredGateway, type Clock, type CompletionGateway } from './metered-gateway';
import { createIntakeReader } from './reader';
import { meetsTarget, summarizeModel } from './report';
import { planTasks, runIntakeEval, type RunnerOptions } from './runner';

/**
 * CC-104 — a rodada inteira com um provedor falso: nenhuma chamada sai. O
 * UnderstandingService, o portão e o taxímetro são os de verdade; o relógio
 * é falso e anda o quanto o provedor falso "demora".
 */

const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';
const GPT_OSS = 'groq:openai/gpt-oss-120b';

const smallUsage: CompletionUsage = {
  promptTokens: 3_000,
  completionTokens: 1_500,
  totalTokens: 4_500,
};

/** A leitura do fixture (AVC, homem de 68 anos), com uma pergunta que o portão aceita. */
const correctReading = JSON.stringify(intakeReadingWire());
const wrongSexReading = JSON.stringify(
  intakeReadingWire(
    intakeReadingFixture({
      structuredData: { ...intakeReadingFixture().structuredData, sex: 'F' },
    }),
  ),
);

function intakeCase(id: string): IntakeCase {
  return {
    id,
    source: { kind: 'clinical_case', caseId: id },
    review: { status: 'draft' },
    input: { caseText: 'Masc, 68a, hemiparesia D e afasia há 1h30. PA 182x104, FC 88, SpO2 96%.' },
    expected: {
      sex: 'M',
      age: 68,
      vitals: {
        systolicBp: 182,
        diastolicBp: 104,
        heartRate: 88,
        respiratoryRate: null,
        spo2: 96,
        temperature: null,
        glucose: null,
      },
      syndrome: ['deficit-neurologico-focal'],
      instability: false,
    },
  };
}

const CASES = ['caso-1', 'caso-2', 'caso-3'].map(intakeCase);
const casesById = new Map(CASES.map((c) => [c.id, c]));

type Reply =
  | { ms: number; content: string; usage?: CompletionUsage; served?: string }
  | { ms: number; error: Error };

class FakeClock implements Clock {
  private time = 0;
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

/** Cada modelo responde, em ordem, o que a lista dele manda; a última resposta se repete. */
function fakeProvider(clock: FakeClock, script: Record<string, Reply[]>) {
  const served: Record<string, number> = {};
  const complete = vi.fn<CompletionGateway['complete']>(async (params) => {
    const model = params.model ?? '';
    const replies = script[model];
    if (!replies) throw new Error(`modelo inesperado: ${model}`);
    const index = served[model] ?? 0;
    served[model] = index + 1;
    const reply = replies[Math.min(index, replies.length - 1)] as Reply;
    clock.advance(reply.ms);
    if ('error' in reply) throw reply.error;
    return {
      content: reply.content,
      model: reply.served ?? model.replace(/^groq:/, ''),
      usage: reply.usage ?? smallUsage,
      latencyMs: reply.ms,
    };
  });
  return { complete };
}

function setup(script: Record<string, Reply[]>, maxUsd = 10) {
  const clock = new FakeClock();
  const provider = fakeProvider(clock, script);
  const guard = new SpendGuard(maxUsd);
  const read = createIntakeReader({
    gateway: new MeteredGateway(provider, guard, clock),
    configFor: (model) => new ConfigService({ AI_INTAKE_MODEL: model }),
    clock,
  });
  const sleeps: number[] = [];
  const options: RunnerOptions = {
    concurrency: 1,
    caseTimeoutMs: 60_000,
    retryPolicy: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 4_000 },
    retryDependencies: {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    },
  };
  return { provider, guard, read, options, sleeps };
}

const usageLimitError = Object.assign(
  new Error(
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."}}',
  ),
  { name: 'BadRequestError', status: 400 },
);

describe('runIntakeEval com provedor falso', () => {
  // Os logs do UnderstandingService (INTAKE_READING...) só poluiriam a saída do teste.
  beforeAll(() => Logger.overrideLogger(false));

  it('measures reading and first-question latency per model and counts data errors', async () => {
    const { read, guard, options } = setup({
      [SONNET]: [10_000, 12_000, 14_000].map((ms) => ({ ms, content: correctReading })),
      [HAIKU]: [{ ms: 6_000, content: wrongSexReading }],
      [GPT_OSS]: [2_000, 3_000, 4_000].map((ms) => ({ ms, content: correctReading })),
    });

    const result = await runIntakeEval(
      planTasks([SONNET, HAIKU, GPT_OSS], CASES, 1),
      { read, guard },
      options,
    );

    expect(result.stop).toBeNull();
    expect(result.rows.map((row) => `${row.caseId}:${row.model}`).slice(0, 3)).toEqual([
      `caso-1:${SONNET}`,
      `caso-1:${HAIKU}`,
      `caso-1:${GPT_OSS}`,
    ]);
    const sonnet = summarizeModel(SONNET, result.rows, casesById, 20_000);
    expect(sonnet.valid).toBe(3);
    expect(sonnet.outcomes.ask).toBe(3);
    expect(sonnet.reading).toEqual({ p50: 12_000, p90: 13_600, n: 3 });
    expect(sonnet.firstQuestion).toEqual({ p50: 12_000, p90: 13_600, n: 3 });
    expect(sonnet.data.sex).toEqual({ errors: 0, total: 3 });
    // claude-sonnet-5-5: 3.000 × $2 + 1.500 × $10 por milhão, três leituras.
    expect(sonnet.cost).toEqual({ knownUsd: expect.closeTo(0.063, 6), unknownCalls: 0 });
    expect(meetsTarget(sonnet)).toBe(false);

    const haiku = summarizeModel(HAIKU, result.rows, casesById, 20_000);
    expect(haiku.data.sex).toEqual({ errors: 3, total: 3 });
    expect(haiku.findings[0]?.checks).toEqual([
      { field: 'sex', kind: 'wrong', expected: 'M', got: 'F' },
    ]);
    expect(meetsTarget(haiku)).toBe(false);

    const gptOss = summarizeModel(GPT_OSS, result.rows, casesById, 20_000);
    expect(gptOss.reading.p50).toBe(3_000);
    expect(gptOss.data.vitalsFields).toEqual({ errors: 0, total: 21 });
    expect(meetsTarget(gptOss)).toBe(true);
  });

  it('includes the validation retry in the reading time and counts a reading that never validates', async () => {
    const { read, guard, options } = setup({
      [SONNET]: [
        { ms: 5_000, content: '{"nao":"valida"}' },
        { ms: 4_000, content: correctReading },
        { ms: 3_000, content: 'sem json' },
      ],
    });

    const { rows } = await runIntakeEval(
      planTasks([SONNET], CASES.slice(0, 2), 1),
      { read, guard },
      options,
    );

    expect(rows[0]).toMatchObject({ outcome: 'ask', readingMs: 9_000 });
    expect(rows[0]?.calls).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      outcome: 'invalid_output',
      fields: null,
      firstQuestionMs: null,
    });
  });

  it('aborts the run at --max-usd: no call goes out after the cap, not even the validation retry', async () => {
    // 100 mil tokens de entrada e 50 mil de saída no Sonnet 5.5: US$ 0,70 por chamada.
    const bigUsage = { promptTokens: 100_000, completionTokens: 50_000, totalTokens: 150_000 };
    const { read, guard, options, provider } = setup(
      {
        [SONNET]: [
          { ms: 1_000, content: correctReading, usage: bigUsage },
          { ms: 1_000, content: 'sem json', usage: bigUsage },
        ],
      },
      1,
    );

    const result = await runIntakeEval(planTasks([SONNET], CASES, 1), { read, guard }, options);

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(result.stop).toEqual({ kind: 'budget', maxUsd: 1, spentUsd: expect.closeTo(1.4, 6) });
    expect(result.rows.map((row) => row.outcome)).toEqual(['ask', 'stopped']);
    expect(result.skipped).toBe(1);
  });

  it('stops at the first usage-limit answer and sends nothing else to any model', async () => {
    const { read, guard, options, provider } = setup({
      [SONNET]: [{ ms: 500, error: usageLimitError }],
      [GPT_OSS]: [{ ms: 500, content: correctReading }],
    });

    const result = await runIntakeEval(
      planTasks([SONNET, GPT_OSS], CASES, 1),
      { read, guard },
      options,
    );

    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(result.stop).toMatchObject({ kind: 'usage_limit', model: SONNET });
    expect(result.stop?.kind === 'usage_limit' && result.stop.detail).toContain('usage limits');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      outcome: 'provider_error',
      failure: 'usage_limit',
      attempts: 1,
      calls: [{ failure: 'usage_limit', errorType: 'BadRequestError:400', costUsd: 0 }],
    });
    expect(result.skipped).toBe(5);
  });

  it('retries a rate-limited reading and keeps only the latency of the attempt that answered', async () => {
    const rateLimited = new Error('AI provider error: 429');
    const { read, guard, options, sleeps } = setup({
      [GPT_OSS]: [
        { ms: 200, error: rateLimited },
        { ms: 200, error: rateLimited },
        { ms: 2_500, content: correctReading },
      ],
    });

    const { rows, stop } = await runIntakeEval(
      planTasks([GPT_OSS], CASES.slice(0, 1), 1),
      { read, guard },
      options,
    );

    expect(stop).toBeNull();
    expect(sleeps).toEqual([500, 1_000]);
    expect(rows[0]).toMatchObject({ outcome: 'ask', attempts: 3, readingMs: 2_500 });
    expect(rows[0]?.calls.map((call) => call.failure)).toEqual(['rate_limit', 'rate_limit', null]);
  });

  it('stops the run when the rate limit persists after every wait', async () => {
    const { read, guard, options, provider } = setup({
      [GPT_OSS]: [{ ms: 100, error: new Error('AI provider error: 429') }],
    });

    const result = await runIntakeEval(planTasks([GPT_OSS], CASES, 1), { read, guard }, options);

    expect(provider.complete).toHaveBeenCalledTimes(3);
    expect(result.stop).toEqual({ kind: 'rate_limit', model: GPT_OSS });
    expect(result.rows).toEqual([
      expect.objectContaining({ outcome: 'provider_error', failure: 'rate_limit', attempts: 3 }),
    ]);
    expect(result.skipped).toBe(2);
  });

  it('records a reading that passes the harness time cap as timeout and moves on', async () => {
    const guard = new SpendGuard(10);
    const read = vi.fn(() => new Promise<never>(() => undefined));

    const { rows, stop } = await runIntakeEval(
      planTasks([SONNET], CASES.slice(0, 1), 1),
      { read, guard },
      {
        concurrency: 1,
        caseTimeoutMs: 20,
      },
    );

    expect(stop).toBeNull();
    expect(rows).toEqual([
      expect.objectContaining({ outcome: 'timeout', readingMs: null, calls: [] }),
    ]);
  });
});
