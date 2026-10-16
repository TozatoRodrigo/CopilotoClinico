import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AiProviderError, AiTruncatedError } from './ai-gateway.errors';
import { errorAfterFailedFallback, readFallbackModel, unavailabilityOf } from './provider-fallback';

const usage = { promptTokens: 1, completionTokens: 0, totalTokens: 1 };

describe('readFallbackModel', () => {
  it('has no reserve when nothing is configured (or the compose passes empty strings)', () => {
    const config = new ConfigService({ AI_FALLBACK_MODEL: '', AI_DECISION_FALLBACK_MODEL: ' ' });

    expect(readFallbackModel(config, 'decision')).toBeUndefined();
  });

  it('uses the general reserve for every stage without its own', () => {
    const config = new ConfigService({ AI_FALLBACK_MODEL: 'claude-sonnet-5-5' });

    expect(readFallbackModel(config, 'intake_reading')).toBe('claude-sonnet-5-5');
    expect(readFallbackModel(config, 'other')).toBe('claude-sonnet-5-5');
  });

  it('lets a stage pick its own reserve, or none at all', () => {
    const config = new ConfigService({
      AI_FALLBACK_MODEL: 'claude-sonnet-5-5',
      AI_DECISION_FALLBACK_MODEL: 'claude-opus-5-5',
      AI_INTAKE_FALLBACK_MODEL: 'NONE',
    });

    expect(readFallbackModel(config, 'decision')).toBe('claude-opus-5-5');
    expect(readFallbackModel(config, 'intake_reading')).toBeUndefined();
    expect(readFallbackModel(config, 'understanding')).toBe('claude-sonnet-5-5');
  });
});

describe('unavailabilityOf', () => {
  it('reads the reason the provider attached to its error', () => {
    const outage = new AiProviderError('AI provider error: 503', {
      status: 503,
      unavailability: 'server_error',
    });
    const badRequest = new AiProviderError('AI provider error: 400', {
      status: 400,
      unavailability: null,
    });

    expect(unavailabilityOf(outage)).toBe('server_error');
    expect(unavailabilityOf(badRequest)).toBeNull();
    expect(unavailabilityOf(new AiTruncatedError({ model: 'm', maxTokens: 10, usage }))).toBeNull();
  });
});

describe('errorAfterFailedFallback', () => {
  const original = new AiProviderError('AI provider error: 503', {
    status: 503,
    unavailability: 'server_error',
  });

  it('keeps the original error when the reserve is down too', () => {
    expect(errorAfterFailedFallback(original, new Error('overloaded'))).toBe(original);
  });

  it("keeps the reserve's truncation, whose cost the caller accounts for", () => {
    const truncated = new AiTruncatedError({ model: 'claude-sonnet-5-5', maxTokens: 10, usage });

    expect(errorAfterFailedFallback(original, truncated)).toBe(truncated);
  });
});
