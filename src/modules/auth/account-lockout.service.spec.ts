import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HttpStatus, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import {
  AccountLockedException,
  AccountLockoutService,
  lockoutKey,
  loginLockoutKey,
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

describe('CC-026 — AccountLockoutService: contador do login', () => {
  const EMAIL = 'doctor@example.com';
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

  async function failLogins(service: AccountLockoutService, count: number, id: string | null) {
    for (let i = 0; i < count; i += 1) {
      expect(await service.reserveLoginAttempt(EMAIL, id)).toBe(true);
    }
  }

  it('a linha é a de antes do CC-026: sha256 do e-mail normalizado', () => {
    const before = createHash('sha256').update(EMAIL).digest('hex');
    expect(loginLockoutKey('  Doctor@Example.COM ')).toBe(before);
  });

  it('5 tentativas passam; a 6ª devolve false (sem lançar) e bloqueia a conta', async () => {
    const { service, rows } = build();
    await failLogins(service, 5, PHYSICIAN_ID);

    expect(await service.reserveLoginAttempt(EMAIL, PHYSICIAN_ID)).toBe(false);
    expect(rows.get(loginLockoutKey(EMAIL))).toMatchObject({
      physicianId: PHYSICIAN_ID,
      failedCount: 5,
      lockedUntil: new Date(T0.getTime() + 15 * MINUTE),
    });
  });

  it('linha nascida de e-mail sem cadastro ganha o id quando ele aparece', async () => {
    const { service, rows } = build();
    await failLogins(service, 2, null);
    expect(rows.get(loginLockoutKey(EMAIL))?.physicianId).toBeNull();

    await failLogins(service, 1, PHYSICIAN_ID);
    expect(rows.get(loginLockoutKey(EMAIL))).toMatchObject({
      physicianId: PHYSICIAN_ID,
      failedCount: 3,
    });
  });

  it('linhas gravadas pelo login antigo continuam valendo', async () => {
    const { service, rows } = build();
    // Bloqueio em curso, gravado no 5º erro pelo código anterior.
    rows.set(loginLockoutKey(EMAIL), {
      identifierHash: loginLockoutKey(EMAIL),
      physicianId: PHYSICIAN_ID,
      failedCount: 5,
      lockedUntil: new Date(T0.getTime() + 10 * MINUTE),
      lastFailedAt: new Date(T0.getTime() - 5 * MINUTE),
    });
    expect(await service.reserveLoginAttempt(EMAIL, PHYSICIAN_ID)).toBe(false);

    // 3 erros dentro da janela: faltam 2.
    rows.set(loginLockoutKey(EMAIL), {
      identifierHash: loginLockoutKey(EMAIL),
      physicianId: PHYSICIAN_ID,
      failedCount: 3,
      lockedUntil: null,
      lastFailedAt: new Date(T0.getTime() - MINUTE),
    });
    await failLogins(service, 2, PHYSICIAN_ID);
    expect(await service.reserveLoginAttempt(EMAIL, PHYSICIAN_ID)).toBe(false);
  });

  it('login e MFA não se zeram um ao outro', async () => {
    const { service, rows } = build();
    await failAttempts(service, 5);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow();
    await failLogins(service, 3, PHYSICIAN_ID);

    await service.clearLogin(EMAIL);
    expect(rows.get(loginLockoutKey(EMAIL))?.failedCount).toBe(0);
    expect(rows.get(lockoutKey('mfa', PHYSICIAN_ID))?.lockedUntil).not.toBeNull();

    await failLogins(service, 3, PHYSICIAN_ID);
    await service.clear('mfa', PHYSICIAN_ID);
    expect(rows.get(loginLockoutKey(EMAIL))?.failedCount).toBe(3);
  });

  it('loga com scope=login e hash curto, nunca o e-mail; sem cadastro, subject=unknown', async () => {
    const { service } = build();
    await failLogins(service, 5, PHYSICIAN_ID);
    expect(await service.reserveLoginAttempt(EMAIL, PHYSICIAN_ID)).toBe(false);
    expect(await service.reserveLoginAttempt(EMAIL, null)).toBe(false);

    const lines = warn.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual([
      expect.stringMatching(
        /^AUTH_ACCOUNT_LOCKED scope=login subject=[0-9a-f]{12} durationMs=900000$/,
      ),
      expect.stringMatching(/^AUTH_RATE_LIMITED reason=account scope=login subject=[0-9a-f]{12}$/),
      'AUTH_RATE_LIMITED reason=account scope=login subject=unknown',
    ]);
    expect(lines.join('\n')).not.toContain(EMAIL);
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
