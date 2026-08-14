import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard';

function contextWithHeaders(headers: Record<string, string | string[] | undefined>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalServiceGuard', () => {
  it('allows a request with the correct token', () => {
    const guard = new InternalServiceGuard(
      new ConfigService({ INTERNAL_SERVICE_TOKEN: 'correct-token' }),
    );

    expect(guard.canActivate(contextWithHeaders({ 'x-internal-token': 'correct-token' }))).toBe(
      true,
    );
  });

  it('rejects a request with the wrong token', () => {
    const guard = new InternalServiceGuard(
      new ConfigService({ INTERNAL_SERVICE_TOKEN: 'correct-token' }),
    );

    expect(() =>
      guard.canActivate(contextWithHeaders({ 'x-internal-token': 'wrong-token' })),
    ).toThrow();
  });

  it('rejects a token of a different length than expected', () => {
    const guard = new InternalServiceGuard(
      new ConfigService({ INTERNAL_SERVICE_TOKEN: 'correct-token' }),
    );

    expect(() =>
      guard.canActivate(contextWithHeaders({ 'x-internal-token': 'short' })),
    ).toThrow();
  });

  it('rejects a missing token', () => {
    const guard = new InternalServiceGuard(
      new ConfigService({ INTERNAL_SERVICE_TOKEN: 'correct-token' }),
    );

    expect(() => guard.canActivate(contextWithHeaders({}))).toThrow();
  });

  it('rejects a header sent as an array (does not crash the comparison)', () => {
    const guard = new InternalServiceGuard(
      new ConfigService({ INTERNAL_SERVICE_TOKEN: 'correct-token' }),
    );

    expect(() =>
      guard.canActivate(contextWithHeaders({ 'x-internal-token': ['correct-token', 'x'] })),
    ).toThrow();
  });

  it('rejects when INTERNAL_SERVICE_TOKEN is not configured', () => {
    const guard = new InternalServiceGuard(new ConfigService({}));

    expect(() =>
      guard.canActivate(contextWithHeaders({ 'x-internal-token': 'anything' })),
    ).toThrow();
  });
});
