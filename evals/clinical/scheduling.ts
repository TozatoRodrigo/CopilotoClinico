/**
 * F0-A — Teto de tempo por caso, retry com backoff e concorrência limitada.
 *
 * Retry só para falha transitória (429/5xx/rede): sem ele, um rate limit vira
 * "erro" de uma variante e não da outra, e a comparação mede o horário em que
 * cada uma rodou. O número de tentativas vai para o resultado — tentativa
 * extra custa dinheiro e não pode ficar invisível.
 */

export type TimedResult<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Teto de relógio, independente do que a chamada faz por dentro. A chamada
 * abandonada continua rodando (o provedor não aceita cancelamento), mas o
 * slot do caso é liberado e o caso vira erro de timeout.
 */
export async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<TimedResult<T>> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<TimedResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    return await Promise.race([
      task.then((value): TimedResult<T> => ({ timedOut: false, value })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
};

/** Backoff exponencial com "equal jitter": metade fixa, metade aleatória. */
export function backoffDelayMs(attempt: number, policy: RetryPolicy, random: () => number): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exponential / 2 + (random() * exponential) / 2);
}

export interface RetryDependencies {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

const realDependencies: RetryDependencies = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

export async function retryWhile<T>(
  run: (attempt: number) => Promise<T>,
  isRetryable: (result: T) => boolean,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  dependencies: RetryDependencies = realDependencies,
): Promise<{ result: T; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    const result = await run(attempt);
    if (attempt >= policy.maxAttempts || !isRetryable(result)) return { result, attempts: attempt };
    await dependencies.sleep(backoffDelayMs(attempt, policy, dependencies.random));
  }
}

/** Executa `worker` sobre os itens com no máximo `limit` em paralelo; preserva a ordem. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  // Um iterador só, compartilhado: cada "trabalhador" puxa o próximo item livre.
  const pending = items.entries();

  async function drain(): Promise<void> {
    for (const [index, item] of pending) {
      results[index] = await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, drain));
  return results;
}
