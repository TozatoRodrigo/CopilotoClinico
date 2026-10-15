import { describe, expect, it } from 'vitest';
import { percentile, wilsonRate } from './stats';

describe('wilsonRate', () => {
  it('calcula o intervalo de 95%', () => {
    const rate = wilsonRate(8, 10);
    expect(rate.rate).toBe(0.8);
    expect(rate.low).toBeCloseTo(0.4902, 3);
    expect(rate.high).toBeCloseTo(0.9433, 3);
  });

  it('fica dentro de [0, 1] nos extremos e é nulo sem observação', () => {
    expect(wilsonRate(0, 5).low).toBe(0);
    expect(wilsonRate(5, 5).high).toBe(1);
    expect(wilsonRate(0, 0).rate).toBeNull();
  });
});

describe('percentile', () => {
  it('interpola entre vizinhos', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.9)).toBe(46);
    expect(percentile([], 0.5)).toBeNull();
  });
});
