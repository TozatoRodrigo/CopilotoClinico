import { describe, expect, it, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, defer } from 'rxjs';
import {
  currentRequestContext,
  requestIdFrom,
  uuidOrNull,
  type RequestContext,
} from './request-context';
import { RequestContextInterceptor } from './request-context.interceptor';

const PHYSICIAN = '11111111-1111-4111-8111-111111111111';
const ENCOUNTER = '22222222-2222-4222-8222-222222222222';

function httpContext(request: Record<string, unknown>) {
  const header = vi.fn();
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header }),
    }),
  } as unknown as ExecutionContext;
  return { context, header };
}

describe('RequestContextInterceptor', () => {
  it('runs the handler inside the request context and returns the id in a header', async () => {
    const { context, header } = httpContext({
      headers: { 'x-request-id': 'proxy-req-0001' },
      params: { encounterId: ENCOUNTER },
      user: { physicianId: PHYSICIAN },
    });
    const handler: CallHandler = {
      handle: () => defer(async () => currentRequestContext()),
    };

    const seen = (await firstValueFrom(
      new RequestContextInterceptor().intercept(context, handler),
    )) as RequestContext | undefined;

    expect(seen).toEqual({
      requestId: 'proxy-req-0001',
      physicianId: PHYSICIAN,
      encounterId: ENCOUNTER,
    });
    expect(header).toHaveBeenCalledWith('x-request-id', 'proxy-req-0001');
  });

  it('creates an id and leaves out route values that are not UUIDs', async () => {
    const { context } = httpContext({ headers: {}, params: { encounterId: 'not-a-uuid' } });
    const handler: CallHandler = { handle: () => defer(async () => currentRequestContext()) };

    const seen = (await firstValueFrom(
      new RequestContextInterceptor().intercept(context, handler),
    )) as RequestContext | undefined;

    expect(seen?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen?.encounterId).toBeNull();
    expect(seen?.physicianId).toBeNull();
  });
});

describe('requestIdFrom', () => {
  it('accepts a safe forwarded id and replaces anything else', () => {
    expect(requestIdFrom('abc-123_XYZ.9')).toBe('abc-123_XYZ.9');
    expect(requestIdFrom('curto')).not.toBe('curto');
    expect(requestIdFrom('com espaço e acento ç')).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom(['lista'])).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('uuidOrNull', () => {
  it('keeps only UUIDs', () => {
    expect(uuidOrNull(ENCOUNTER)).toBe(ENCOUNTER);
    expect(uuidOrNull('enc-001')).toBeNull();
    expect(uuidOrNull(undefined)).toBeNull();
  });
});
