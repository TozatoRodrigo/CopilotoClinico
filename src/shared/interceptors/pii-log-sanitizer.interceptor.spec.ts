import { afterEach, describe, it, expect, vi } from 'vitest';
import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  PiiLogSanitizerInterceptor,
  bodyFieldsForLog,
  pathForLog,
} from './pii-log-sanitizer.interceptor';

describe('bodyFieldsForLog', () => {
  it('lists the field names and never the values', () => {
    const line = bodyFieldsForLog({
      caseText: 'Maria da Silva, 54 anos, dor torácica',
      context: { hasCT: true },
    });

    expect(line).toBe('caseText,context');
    expect(line).not.toContain('Maria');
  });

  it('describes bodies that are not plain objects', () => {
    expect(bodyFieldsForLog(undefined)).toBe('-');
    expect(bodyFieldsForLog({})).toBe('-');
    expect(bodyFieldsForLog([{ answer: 'sim' }])).toBe('array(1)');
    expect(bodyFieldsForLog('texto livre')).toBe('string');
  });
});

// OPS-003 — a linha de acesso nunca grava a querystring.
describe('pathForLog', () => {
  it('drops the query string, which may carry physician text', () => {
    expect(pathForLog('/v1/guidelines/search?q=dor%20tor%C3%A1cica&limit=5')).toBe(
      '/v1/guidelines/search',
    );
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
      body: { email: 'medica@example.com', password: 'senha-errada' },
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
    // A linha de erro continua com os nomes dos campos do corpo (#168).
    expect(String(warn.mock.calls[0]?.[0])).toContain('bodyFields=email,password');
  });
});
