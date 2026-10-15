import { percentile, wilsonRate, type Rate } from '../clinical/stats';

/**
 * CC-407 — métricas do bake-off do portão de relevância. "Positivo" = o
 * portão deixa o cartão entrar (escore ≥ limiar); "relevante" = o médico
 * disse que o cartão se aplica.
 *
 * Falso positivo (cartão do cenário errado na decisão, com dose liberada) é
 * pior que falso negativo (a análise segue sem o cartão, como antes): o
 * limiar sugerido maximiza F1 só entre os que mantêm a precisão mínima.
 */

/** Meta da CC-407: precisão ≥ 90% com revocação ≥ 80%. */
export const TARGET_PRECISION = 0.9;
export const TARGET_RECALL = 0.8;

export interface ScoredPair {
  pairId: string;
  cardId: string;
  relevant: boolean;
  /** `null`: o portão não julgou o par (falha, freio de gasto, sem similaridade). */
  score: number | null;
}

export interface ConfusionCounts {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
}

export interface ThresholdMetrics {
  threshold: number;
  counts: ConfusionCounts;
  /** Com intervalo de Wilson; `rate` `null` sem nenhum positivo previsto. */
  precision: Rate;
  /** Com intervalo de Wilson; `rate` `null` sem nenhum par relevante julgado. */
  recall: Rate;
  f1: number | null;
}

function judged(pairs: readonly ScoredPair[]): Array<ScoredPair & { score: number }> {
  return pairs.filter((pair): pair is ScoredPair & { score: number } => pair.score !== null);
}

export function metricsAt(pairs: readonly ScoredPair[], threshold: number): ThresholdMetrics {
  const counts: ConfusionCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
  };
  for (const pair of judged(pairs)) {
    const accepted = pair.score >= threshold;
    if (accepted && pair.relevant) counts.truePositive++;
    else if (accepted) counts.falsePositive++;
    else if (pair.relevant) counts.falseNegative++;
    else counts.trueNegative++;
  }
  const precision = wilsonRate(counts.truePositive, counts.truePositive + counts.falsePositive);
  const recall = wilsonRate(counts.truePositive, counts.truePositive + counts.falseNegative);
  const f1 =
    precision.rate === null || recall.rate === null
      ? null
      : precision.rate + recall.rate === 0
        ? 0
        : (2 * precision.rate * recall.rate) / (precision.rate + recall.rate);
  return { threshold, counts, precision, recall, f1 };
}

/**
 * O limiar que maximiza F1 com precisão ≥ `minPrecision`. Candidatos: os
 * escores observados (entre dois escores vizinhos nada muda); o limiar é o
 * menor escore aceito. Empate em F1: maior precisão, depois o limiar mais
 * alto. `null` quando nenhum limiar atinge a precisão mínima.
 */
export function chooseThreshold(
  pairs: readonly ScoredPair[],
  minPrecision: number,
): ThresholdMetrics | null {
  const thresholds = [...new Set(judged(pairs).map((pair) => pair.score))].sort((a, b) => a - b);
  let best: ThresholdMetrics | null = null;
  for (const threshold of thresholds) {
    const metrics = metricsAt(pairs, threshold);
    if (metrics.precision.rate === null || metrics.precision.rate < minPrecision) continue;
    if (!best || isBetter(metrics, best)) best = metrics;
  }
  return best;
}

function isBetter(candidate: ThresholdMetrics, current: ThresholdMetrics): boolean {
  const f1 = (metrics: ThresholdMetrics) => metrics.f1 ?? 0;
  if (f1(candidate) !== f1(current)) return f1(candidate) > f1(current);
  const precision = (metrics: ThresholdMetrics) => metrics.precision.rate ?? 0;
  if (precision(candidate) !== precision(current)) {
    return precision(candidate) > precision(current);
  }
  return candidate.threshold > current.threshold;
}

export function meetsTarget(metrics: ThresholdMetrics | null): boolean {
  return (
    metrics !== null &&
    (metrics.precision.rate ?? 0) >= TARGET_PRECISION &&
    (metrics.recall.rate ?? 0) >= TARGET_RECALL
  );
}

/**
 * Brier: média de (escore − rótulo)², com o escore preso em 0–1. Só mede
 * calibração quando o escore é probabilidade (Jev); para o reranker e a
 * similaridade é referência.
 */
export function brierScore(pairs: readonly ScoredPair[]): number | null {
  const scored = judged(pairs);
  if (scored.length === 0) return null;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return (
    scored.reduce((sum, pair) => sum + (clamp(pair.score) - (pair.relevant ? 1 : 0)) ** 2, 0) /
    scored.length
  );
}

export interface ReliabilityBin {
  low: number;
  high: number;
  count: number;
  meanScore: number;
  /** Fração de pares relevantes no intervalo: com calibração perfeita, ≈ `meanScore`. */
  observedRate: number;
}

/** Curva de calibração em `bins` faixas iguais de 0 a 1; faixa vazia fica de fora. */
export function reliabilityCurve(pairs: readonly ScoredPair[], bins = 10): ReliabilityBin[] {
  const buckets = Array.from({ length: bins }, () => [] as Array<ScoredPair & { score: number }>);
  for (const pair of judged(pairs)) {
    const clamped = Math.min(1, Math.max(0, pair.score));
    buckets[Math.min(bins - 1, Math.floor(clamped * bins))]!.push(pair);
  }
  return buckets.flatMap((bucket, index) =>
    bucket.length === 0
      ? []
      : [
          {
            low: index / bins,
            high: (index + 1) / bins,
            count: bucket.length,
            meanScore: bucket.reduce((sum, pair) => sum + pair.score, 0) / bucket.length,
            observedRate: bucket.filter((pair) => pair.relevant).length / bucket.length,
          },
        ],
  );
}

export interface LatencySummary {
  calls: number;
  p50: number | null;
  p95: number | null;
}

export function latencySummary(latenciesMs: readonly number[]): LatencySummary {
  return {
    calls: latenciesMs.length,
    p50: percentile(latenciesMs, 0.5),
    p95: percentile(latenciesMs, 0.95),
  };
}
