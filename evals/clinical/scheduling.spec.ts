import { describe, expect, it } from 'vitest';
import { backoffDelayMs, mapWithConcurrency, retryWhile, withTimeout } from './scheduling';

const policy = { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 4_000 };

describe('retryWhile', () => {
  it('repete enquanto o resultado é transitório e conta as tentativas', async () => {
    const delays: number[] = [];
    const outcomes = ['429', '503', 'ok'];
    const { result, attempts } = await retryWhile(
      async (attempt) => outcomes[attempt - 1] ?? 'ok',
      (outcome) => outcome !== 'ok',
      policy,
      { sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(delays).toEqual([750, 1_500]);
  });

  it('para no teto de tentativas e devolve a última falha', async () => {
    const { result, attempts } = await retryWhile(
      async () => '429',
      () => true,
      policy,
      { sleep: async () => undefined, random: () => 0 },
    );
    expect(result).toBe('429');
    expect(attempts).toBe(3);
  });
});

describe('backoffDelayMs', () => {
  it('cresce exponencialmente com jitter e respeita o teto', () => {
    expect(backoffDelayMs(1, policy, () => 0)).toBe(500);
    expect(backoffDelayMs(1, policy, () => 1)).toBe(1_000);
    expect(backoffDelayMs(5, policy, () => 1)).toBe(4_000);
  });
});

describe('withTimeout', () => {
  it('devolve o valor quando a tarefa termina antes do teto', async () => {
    expect(await withTimeout(Promise.resolve(42), 1_000)).toEqual({ timedOut: false, value: 42 });
  });

  it('libera o slot quando a tarefa passa do teto', async () => {
    const neverEnds = new Promise<number>(() => undefined);
    expect(await withTimeout(neverEnds, 10)).toEqual({ timedOut: true });
  });
});

describe('mapWithConcurrency', () => {
  it('nunca passa do limite e preserva a ordem', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5], 2, async (delay, index) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running--;
      return index;
    });

    expect(results).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });
});
