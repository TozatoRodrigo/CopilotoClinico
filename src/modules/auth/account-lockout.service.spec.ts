import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HttpStatus, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import {
  AccountLockedException,
  AccountLockoutService,
  lockoutKey,
  readLockoutPolicy,
} from './account-lockout.service';

const PHYSICIAN_ID = '550e8400-e29b-41d4-a716-446655440000';
const T0 = new Date('2026-10-15T12:00:00.000Z');
const MINUTE = 60 * 1000;

interface Row {
  identifierHash: string;
  physicianId: string | null;
  failedCount: number;
  lockedUntil: Date | null;
  lastFailedAt: Date | null;
}

type DateFilter = null | { lte?: Date; lt?: Date };
interface Where {
  identifierHash?: string;
  lockedUntil?: DateFilter;
  lastFailedAt?: DateFilter;
  failedCount?: { lt?: number; gte?: number };
  OR?: Where[];
}

function matchesDate(value: Date | null, filter: DateFilter | undefined): boolean {
  if (filter === undefined) return true;
  if (filter === null) return value === null;
  if (value === null) return false;
  if (filter.lte && !(value <= filter.lte)) return false;
  if (filter.lt && !(value < filter.lt)) return false;
  return true;
}

function matches(row: Row, where: Where): boolean {
  if (where.identifierHash !== undefined && row.identifierHash !== where.identifierHash) {
    return false;
  }
  if (!matchesDate(row.lockedUntil, where.lockedUntil)) return false;
  if (!matchesDate(row.lastFailedAt, where.lastFailedAt)) return false;
  if (where.failedCount?.lt !== undefined && !(row.failedCount < where.failedCount.lt)) {
    return false;
  }
  if (where.failedCount?.gte !== undefined && !(row.failedCount >= where.failedCount.gte)) {
    return false;
  }
  if (where.OR && !where.OR.some((branch) => matches(row, branch))) return false;
  return true;
}

/**
 * Só o que o serviço usa de `loginSecurityState`, com a semântica do Postgres
 * para uma requisição por vez. A concorrência real fica no teste de
 * integração (tests/integration/cc-025-account-lockout.integration-spec.ts).
 */
function fakePrisma() {
  const rows = new Map<string, Row>();
  const loginSecurityState = {
    createMany: vi.fn(
      async ({ data }: { data: Array<Pick<Row, 'identifierHash' | 'physicianId'>> }) => {
        let count = 0;
        for (const item of data) {
          if (rows.has(item.identifierHash)) continue;
          rows.set(item.identifierHash, {
            ...item,
            failedCount: 0,
            lockedUntil: null,
            lastFailedAt: null,
          });
          count += 1;
        }
        return { count };
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Where;
        data: Partial<Omit<Row, 'failedCount'>> & { failedCount?: number | { increment: number } };
      }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (!matches(row, where)) continue;
          const { failedCount, ...rest } = data;
          Object.assign(row, rest);
          if (typeof failedCount === 'number') row.failedCount = failedCount;
          if (typeof failedCount === 'object') row.failedCount += failedCount.increment;
          count += 1;
        }
        return { count };
      },
    ),
  };
  return { prisma: { loginSecurityState } as unknown as PrismaService, rows };
}

function build(env: Record<string, string> = {}) {
  const { prisma, rows } = fakePrisma();
  const service = new AccountLockoutService(prisma, new ConfigService(env));
  return { service, rows };
}

/** N tentativas com o segredo errado: reserva e não zera, como o MfaService faz. */
async function failAttempts(service: AccountLockoutService, count: number) {
  for (let i = 0; i < count; i += 1) await service.reserveAttempt('mfa', PHYSICIAN_ID);
}

describe('CC-025 — AccountLockoutService', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  it('5 tentativas sem acerto: a 6ª é recusada com 429 e a conta fica bloqueada', async () => {
    const { service, rows } = build();
    await failAttempts(service, 5);

    const refused = service.reserveAttempt('mfa', PHYSICIAN_ID);
    await expect(refused).rejects.toThrow(AccountLockedException);
    await expect(refused).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(rows.get(lockoutKey('mfa', PHYSICIAN_ID))?.lockedUntil).toEqual(
      new Date(T0.getTime() + 15 * MINUTE),
    );
  });

  it('acerto antes do teto zera o contador', async () => {
    const { service, rows } = build();
    await failAttempts(service, 5);
    await service.clear('mfa', PHYSICIAN_ID);

    expect(rows.get(lockoutKey('mfa', PHYSICIAN_ID))).toMatchObject({
      failedCount: 0,
      lockedUntil: null,
    });
    await failAttempts(service, 4);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).resolves.toBeUndefined();
  });

  it('o bloqueio vence depois de AUTH_LOCKOUT_DURATION_MS e a contagem recomeça', async () => {
    const { service } = build();
    await failAttempts(service, 5);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow(
      AccountLockedException,
    );

    vi.setSystemTime(new Date(T0.getTime() + 14 * MINUTE));
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow(
      AccountLockedException,
    );

    vi.setSystemTime(new Date(T0.getTime() + 16 * MINUTE));
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).resolves.toBeUndefined();
  });

  it('tentativas espaçadas além da janela não se acumulam', async () => {
    const { service } = build();
    await failAttempts(service, 4);

    vi.setSystemTime(new Date(T0.getTime() + 16 * MINUTE));
    await failAttempts(service, 4);

    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).resolves.toBeUndefined();
  });

  it('MFA e troca de senha têm contadores separados, e nenhum é a linha do login', async () => {
    const { service, rows } = build();
    await failAttempts(service, 5);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow();

    await expect(service.reserveAttempt('password_change', PHYSICIAN_ID)).resolves.toBeUndefined();
    const loginKey = createHash('sha256').update('doctor@example.com').digest('hex');
    expect(lockoutKey('mfa', PHYSICIAN_ID)).not.toBe(lockoutKey('password_change', PHYSICIAN_ID));
    expect([...rows.keys()]).not.toContain(loginKey);
  });

  it('respeita AUTH_LOCKOUT_MAX_ATTEMPTS', async () => {
    const { service } = build({ AUTH_LOCKOUT_MAX_ATTEMPTS: '2' });
    await failAttempts(service, 2);

    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow(
      AccountLockedException,
    );
  });

  it('loga o bloqueio uma vez e cada recusa, só com hash curto do id', async () => {
    const { service } = build();
    await failAttempts(service, 5);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow();
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow();

    const lines = warn.mock.calls.map(([message]) => String(message));
    const refusal = /^AUTH_RATE_LIMITED reason=account scope=mfa subject=[0-9a-f]{12}$/;
    expect(lines).toEqual([
      expect.stringMatching(
        /^AUTH_ACCOUNT_LOCKED scope=mfa subject=[0-9a-f]{12} durationMs=900000$/,
      ),
      expect.stringMatching(refusal),
      expect.stringMatching(refusal),
    ]);
    expect(lines.join('\n')).not.toContain(PHYSICIAN_ID);
  });
});

describe('CC-025 — readLockoutPolicy', () => {
  it('padrão: 5 tentativas, janela e bloqueio de 15 min', () => {
    expect(readLockoutPolicy(new ConfigService({}))).toEqual({
      maxAttempts: 5,
      windowMs: 15 * MINUTE,
      durationMs: 15 * MINUTE,
    });
  });

  it('valor inválido ou não positivo cai no padrão', () => {
    expect(
      readLockoutPolicy(
        new ConfigService({
          AUTH_LOCKOUT_MAX_ATTEMPTS: 'abc',
          AUTH_LOCKOUT_WINDOW_MS: '0',
          AUTH_LOCKOUT_DURATION_MS: '-5',
        }),
      ),
    ).toEqual({ maxAttempts: 5, windowMs: 15 * MINUTE, durationMs: 15 * MINUTE });
  });
});
