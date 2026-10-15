import { describe, expect, it } from 'vitest';
import {
  brierScore,
  chooseThreshold,
  latencySummary,
  meetsTarget,
  metricsAt,
  reliabilityCurve,
  type ScoredPair,
} from './gate-scoring';

function scored(entries: Array<[score: number | null, relevant: boolean]>): ScoredPair[] {
  return entries.map(([score, relevant], index) => ({
    pairId: `p${index}`,
    cardId: `c${index}`,
    relevant,
    score,
  }));
}

describe('métricas do bake-off do portão (CC-407)', () => {
  const pairs = scored([
    [0.95, true],
    [0.9, true],
    [0.85, false],
    [0.8, true],
    [0.6, true],
    [0.4, false],
    [0.2, false],
    [null, true],
  ]);

  it('conta acertos e erros no limiar, sem os pares não julgados', () => {
    const metrics = metricsAt(pairs, 0.8);

    expect(metrics.counts).toEqual({
      truePositive: 3,
      falsePositive: 1,
      falseNegative: 1,
      trueNegative: 2,
    });
    expect(metrics.precision.rate).toBe(0.75);
    expect(metrics.recall.rate).toBe(0.75);
    expect(metrics.f1).toBeCloseTo(0.75);
    expect(metrics.precision.low).toBeLessThan(0.75);
    expect(metrics.precision.high).toBeGreaterThan(0.75);
  });

  it('sem positivo previsto, a precisão fica indefinida', () => {
    const metrics = metricsAt(pairs, 0.99);

    expect(metrics.precision.rate).toBeNull();
    expect(metrics.recall.rate).toBe(0);
    expect(metrics.f1).toBeNull();
  });

  it('o limiar sugerido maximiza F1 só entre os que mantêm a precisão mínima', () => {
    // Sem a restrição, 0,6 ganharia (F1 0,889, precisão 80%): cartão errado entra.
    expect(metricsAt(pairs, 0.6).f1).toBeCloseTo(0.889, 3);

    const chosen = chooseThreshold(pairs, 0.9);

    expect(chosen?.threshold).toBe(0.9);
    expect(chosen?.precision.rate).toBe(1);
    expect(chosen?.recall.rate).toBe(0.5);
    expect(chooseThreshold(pairs, 0.75)?.threshold).toBe(0.6);
  });

  it('a precisão mínima decide antes do F1', () => {
    const tied = scored([
      [0.9, true],
      [0.7, false],
      [0.5, true],
      [0.3, false],
    ]);
    // 0,9: P 100%, R 50%, F1 0,667. 0,5: P 66,7%, R 100%, F1 0,8. Mínimo 60%: vence 0,5.
    expect(chooseThreshold(tied, 0.6)?.threshold).toBe(0.5);
    expect(chooseThreshold(tied, 0.7)?.threshold).toBe(0.9);
  });

  it('nenhum limiar atinge a precisão mínima: sem sugestão', () => {
    const noisy = scored([
      [0.9, false],
      [0.8, true],
      [0.7, false],
    ]);

    expect(chooseThreshold(noisy, 0.9)).toBeNull();
    expect(meetsTarget(null)).toBe(false);
  });

  it('a meta é precisão ≥ 90% com revocação ≥ 80%', () => {
    const good = scored([
      [0.9, true],
      [0.8, true],
      [0.7, true],
      [0.6, true],
      [0.5, true],
      [0.2, false],
    ]);

    expect(meetsTarget(chooseThreshold(good, 0.9))).toBe(true);
    expect(meetsTarget(metricsAt(pairs, 0.9))).toBe(false);
  });

  it('Brier: 0 para o escore perfeito, 0,25 para quem chuta 0,5', () => {
    expect(
      brierScore(
        scored([
          [1, true],
          [0, false],
          [null, true],
        ]),
      ),
    ).toBe(0);
    expect(
      brierScore(
        scored([
          [0.5, true],
          [0.5, false],
        ]),
      ),
    ).toBe(0.25);
    expect(brierScore(scored([[null, true]]))).toBeNull();
  });

  it('curva de calibração por faixa, sem faixa vazia', () => {
    const curve = reliabilityCurve(
      scored([
        [0.05, false],
        [0.92, true],
        [0.97, false],
        [1, true],
      ]),
    );

    expect(curve).toEqual([
      { low: 0, high: 0.1, count: 1, meanScore: 0.05, observedRate: 0 },
      {
        low: 0.9,
        high: 1,
        count: 3,
        meanScore: expect.closeTo(0.963, 3),
        observedRate: expect.closeTo(0.667, 3),
      },
    ]);
  });

  it('latência p50/p95 por chamada', () => {
    expect(latencySummary([100, 200, 300, 400, 500])).toEqual({ calls: 5, p50: 300, p95: 480 });
    expect(latencySummary([])).toEqual({ calls: 0, p50: null, p95: null });
  });
});
