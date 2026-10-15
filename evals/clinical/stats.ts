/**
 * F0-A — Taxa com intervalo de confiança de 95% (Wilson). Com dezenas de
 * casos, uma diferença de poucos pontos entre variantes cabe dentro do ruído;
 * o intervalo é o que impede o relatório de vender empate como vitória.
 *
 * Wilson em vez da aproximação normal porque continua correto perto de 0% e
 * de 100%, que é onde ficam as métricas de segurança.
 */

const Z_95 = 1.959964;

export interface Rate {
  passed: number;
  total: number;
  /** `null` quando não há nenhuma observação. */
  rate: number | null;
  low: number | null;
  high: number | null;
}

export function wilsonRate(passed: number, total: number): Rate {
  if (total === 0) return { passed, total, rate: null, low: null, high: null };

  const proportion = passed / total;
  const zSquared = Z_95 ** 2;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const halfWidth =
    (Z_95 * Math.sqrt((proportion * (1 - proportion)) / total + zSquared / (4 * total ** 2))) /
    denominator;

  return {
    passed,
    total,
    rate: proportion,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
  };
}

export function rateOf(outcomes: readonly boolean[]): Rate {
  return wilsonRate(outcomes.filter(Boolean).length, outcomes.length);
}

/** Percentil com interpolação linear entre os vizinhos; `null` sem amostra. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[Math.min(lowerIndex + 1, sorted.length - 1)] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
