import { describe, it, expect } from 'vitest';
import { sanitizeForLog } from './pii-log-sanitizer.interceptor';

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
