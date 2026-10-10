import { describe, expect, it } from 'vitest';
import { calculateInferenceCost, hasModelPrice } from './model-pricing';

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

  describe('current Claude models', () => {
    const oneMillionEach = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    };

    it.each([
      ['claude-opus-5-5', 24],
      ['claude-sonnet-5-5', 12],
      ['claude-haiku-5-5', 0.6],
      ['claude-opus-5', 30],
    ])('prices %s at its per-million input + output rate', (model, expected) => {
      expect(calculateInferenceCost({ model, usage: oneMillionEach })).toBe(expected);
    });

    it('bills cache reads at the cache rate, not the input rate', () => {
      const cost = calculateInferenceCost({
        model: 'claude-opus-5-5',
        usage: {
          promptTokens: 1_000_000,
          completionTokens: 0,
          totalTokens: 1_000_000,
          cacheReadTokens: 1_000_000,
        },
      });

      expect(cost).toBe(0.2);
    });

    it('bills cache writes at 1.25x the input rate', () => {
      const cost = calculateInferenceCost({
        model: 'claude-sonnet-5-5',
        usage: {
          promptTokens: 1_000_000,
          completionTokens: 0,
          totalTokens: 1_000_000,
          cacheWriteTokens: 1_000_000,
        },
      });

      expect(cost).toBe(2.5);
    });

    it('splits a prompt into uncached, cache-read and cache-write tokens', () => {
      const cost = calculateInferenceCost({
        model: 'claude-sonnet-5-5',
        usage: {
          promptTokens: 10_000,
          completionTokens: 1_000,
          totalTokens: 11_000,
          cacheReadTokens: 8_000,
          cacheWriteTokens: 1_000,
        },
      });

      // 1000 uncached × $2 + 8000 × $0.20 + 1000 × $2.50 + 1000 out × $10, per million
      expect(cost).toBe(0.0161);
    });
  });

  it('prices a dated snapshot with its alias price', () => {
    const cost = calculateInferenceCost({
      model: 'gpt-4o-2024-08-06',
      usage: { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 },
    });

    expect(cost).toBe(2.5);
  });

  it('bills cached tokens at the input rate when the model has no cache price', () => {
    const cost = calculateInferenceCost({
      model: 'gpt-4o',
      usage: {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadTokens: 500_000,
      },
    });

    expect(cost).toBe(2.5);
  });

  describe('F0-A: candidatos OpenAI ao modelo de produção', () => {
    it.each([
      ['gpt-4.1', 10],
      ['gpt-4.1-mini', 2],
      ['gpt-5', 11.25],
      ['gpt-5-mini', 2.25],
    ])('cobra %s pelo preço oficial de entrada + saída', (model, expected) => {
      const oneMillionEach = {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      };
      expect(calculateInferenceCost({ model, usage: oneMillionEach })).toBe(expected);
    });

    it('cobra o snapshot datado pelo preço do alias', () => {
      const usage = { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 };
      expect(calculateInferenceCost({ model: 'gpt-5-2025-08-07', usage })).toBe(1.25);
    });
  });

  describe('hasModelPrice', () => {
    it('distingue modelo com preço de modelo que cairia na taxa genérica', () => {
      expect(hasModelPrice('claude-opus-5-5')).toBe(true);
      expect(hasModelPrice('gpt-4.1-mini-2025-04-14')).toBe(true);
      expect(hasModelPrice('deterministic-test')).toBe(false);
    });
  });
});
