import { describe, expect, it } from 'vitest';
import { calculateInferenceCost } from './model-pricing';

describe('calculateInferenceCost', () => {
  it('uses model-specific input and output token prices', () => {
    const cost = calculateInferenceCost({
      model: 'claude-3-sonnet',
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    expect(cost).toBe(0.0033);
  });

  it('falls back to a conservative total-token price for unknown models', () => {
    const cost = calculateInferenceCost({
      model: 'unknown-model',
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    expect(cost).toBe(0.003);
  });
});
