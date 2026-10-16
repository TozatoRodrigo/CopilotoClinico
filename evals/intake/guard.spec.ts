import { describe, expect, it } from 'vitest';
import { AiRefusalError } from '../../src/modules/ai-gateway/ai-gateway.errors';
import { classifyProviderError, EvalStoppedError, SpendGuard } from './guard';

/** Como o SDK da Anthropic monta a mensagem: status e o corpo do erro. */
function anthropicError(status: number, message: string): Error {
  const error = new Error(
    `${status} ${JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } })}`,
  );
  return Object.assign(error, { name: 'BadRequestError', status });
}

const usage = { promptTokens: 10, completionTokens: 10, totalTokens: 20 };

describe('classifyProviderError', () => {
  it('recognizes the Anthropic workspace usage limit and the empty credit balance', () => {
    expect(
      classifyProviderError(
        anthropicError(
          400,
          'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.',
        ),
      ),
    ).toBe('usage_limit');
    expect(
      classifyProviderError(
        anthropicError(400, 'Your credit balance is too low to access the Anthropic API.'),
      ),
    ).toBe('usage_limit');
  });

  it('reads the status of SDK errors and of the OpenAI-compatible provider message', () => {
    expect(classifyProviderError(Object.assign(new Error('429 rate'), { status: 429 }))).toBe(
      'rate_limit',
    );
    expect(classifyProviderError(new Error('AI provider error: 429'))).toBe('rate_limit');
    expect(classifyProviderError(new Error('AI provider error: 503'))).toBe('server_error');
    expect(classifyProviderError(new Error('AI provider network error'))).toBe('server_error');
    expect(classifyProviderError(new Error('AI provider error: 400'))).toBe('other');
  });

  it('keeps refusal and the harness stop apart from provider errors', () => {
    const refusal = new AiRefusalError({ model: 'm', category: null, explanation: null, usage });
    expect(classifyProviderError(refusal)).toBe('refusal');
    expect(classifyProviderError(new EvalStoppedError({ kind: 'rate_limit', model: 'm' }))).toBe(
      'stopped',
    );
  });
});

describe('SpendGuard', () => {
  it('stops at the cap and blocks every call after it', () => {
    const guard = new SpendGuard(1);
    guard.addSpend(0.6);
    expect(() => guard.assertCanCall()).not.toThrow();
    guard.addSpend(0.4);
    expect(guard.stopReason).toEqual({ kind: 'budget', maxUsd: 1, spentUsd: 1 });
    expect(() => guard.assertCanCall()).toThrow(EvalStoppedError);
  });

  it('keeps the first reason', () => {
    const guard = new SpendGuard(10);
    guard.stop({ kind: 'usage_limit', model: 'claude-sonnet-5-5', detail: 'limite' });
    guard.addSpend(20);
    expect(guard.stopReason?.kind).toBe('usage_limit');
  });
});
