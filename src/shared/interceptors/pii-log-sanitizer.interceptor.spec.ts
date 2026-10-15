import { afterEach, describe, it, expect, vi } from 'vitest';
import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  PiiLogSanitizerInterceptor,
  pathForLog,
  sanitizeForLog,
} from './pii-log-sanitizer.interceptor';

describe('sanitizeForLog', () => {
  it('redacts password field', () => {
    const result = sanitizeForLog({ email: 'dr@example.com', password: 'secret123' });
    expect((result as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((result as Record<string, unknown>).email).toBe('dr@example.com');
  });

  it('redacts token fields', () => {
    const result = sanitizeForLog({
      accessToken: 'eyJ...',
      refreshToken: 'eyJ...',
      mfaToken: 'eyJ...',
    }) as Record<string, unknown>;
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.mfaToken).toBe('[REDACTED]');
  });

  it('redacts mfaSecret and codeHash', () => {
    const result = sanitizeForLog({
      mfaSecret: 'BASE32SECRET',
      codeHash: 'abc123',
    }) as Record<string, unknown>;
    expect(result.mfaSecret).toBe('[REDACTED]');
    expect(result.codeHash).toBe('[REDACTED]');
  });

  it('redacts passwordHash', () => {
    const result = sanitizeForLog({ passwordHash: '$2b$12$...' }) as Record<string, unknown>;
    expect(result.passwordHash).toBe('[REDACTED]');
  });

  it('passes through non-sensitive fields unchanged', () => {
    const result = sanitizeForLog({
      id: 'uuid-001',
      name: 'Dr. Test',
      crmVerified: true,
    }) as Record<string, unknown>;
    expect(result.id).toBe('uuid-001');
    expect(result.name).toBe('Dr. Test');
    expect(result.crmVerified).toBe(true);
  });

  it('handles nested objects recursively', () => {
    const result = sanitizeForLog({
      physician: {
        id: 'uuid-001',
        credentials: { password: 'secret', email: 'dr@example.com' },
      },
    }) as { physician: { credentials: Record<string, unknown> } };
    expect(result.physician?.credentials?.password).toBe('[REDACTED]');
    expect(result.physician?.credentials?.email).toBe('dr@example.com');
  });

  it('handles arrays', () => {
    const result = sanitizeForLog([
      { token: 'tok-1', id: '1' },
      { token: 'tok-2', id: '2' },
    ]) as Array<Record<string, unknown>>;
    expect(result[0]?.token).toBe('[REDACTED]');
    expect(result[0]?.id).toBe('1');
    expect(result[1]?.token).toBe('[REDACTED]');
  });

  it('handles null and undefined values safely', () => {
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });

  it('handles primitive values', () => {
    expect(sanitizeForLog('string')).toBe('string');
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(true)).toBe(true);
  });
});

// OPS-003 — a rota GET /copilot/stream (clientes PWA antigos) leva o texto do
// caso na querystring (EventSource só faz GET): a linha de acesso nunca o grava.
describe('pathForLog', () => {
  it('drops the query string, where streaming routes carry the physician text', () => {
    expect(
      pathForLog('/v1/encounters/enc-1/copilot/stream?caseText=dor%20tor%C3%A1cica&hasCT=true'),
    ).toBe('/v1/encounters/enc-1/copilot/stream');
  });

  it('keeps a path without query string unchanged', () => {
    expect(pathForLog('/v1/encounters/enc-1/copilot/respond')).toBe(
      '/v1/encounters/enc-1/copilot/respond',
    );
  });
});

// CC-026 — o IP do médico é dado pessoal: a linha de acesso não o grava, nem o
// do socket nem o do X-Forwarded-For.
describe('PiiLogSanitizerInterceptor', () => {
  const CLIENT_IP = '203.0.113.7';
  const SOCKET_IP = '172.18.0.5';

  function context(): ExecutionContext {
    const req = {
      method: 'POST',
      url: '/v1/auth/login',
      body: {},
      ip: SOCKET_IP,
      headers: { 'x-forwarded-for': CLIENT_IP },
    };
    return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('linha de sucesso e de erro sem IP', async () => {
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const interceptor = new PiiLogSanitizerInterceptor();

    await lastValueFrom(
      interceptor.intercept(context(), { handle: () => of('ok') } as CallHandler),
    );
    await expect(
      lastValueFrom(
        interceptor.intercept(context(), {
          handle: () => throwError(() => new Error('Invalid credentials')),
        } as CallHandler),
      ),
    ).rejects.toThrow('Invalid credentials');

    const lines = [...debug.mock.calls, ...warn.mock.calls].map(([message]) => String(message));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain('POST /v1/auth/login');
      expect(line).not.toContain(CLIENT_IP);
      expect(line).not.toContain(SOCKET_IP);
    }
  });
});
