/**
 * Testes de integração — CC-025: limite de tentativas por conta (MFA, troca de
 * senha) contra PostgreSQL real.
 *
 * O teste unitário prova a máquina de estados; este prova o que só o banco
 * prova: a reserva da tentativa é atômica. Um ataque em paralelo não pode
 * conferir mais códigos do que AUTH_LOCKOUT_MAX_ATTEMPTS.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import {
  AccountLockedException,
  AccountLockoutService,
  lockoutKey,
} from '../../src/modules/auth/account-lockout.service';

const PHYSICIAN_ID = '00000000-0000-0000-0000-0000000c0025';
const KEYS = [lockoutKey('mfa', PHYSICIAN_ID), lockoutKey('password_change', PHYSICIAN_ID)];

describe('CC-025 — limite de tentativas por conta (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: AccountLockoutService;

  async function clearRows() {
    await prisma.loginSecurityState.deleteMany({ where: { identifierHash: { in: KEYS } } });
  }

  async function mfaRow() {
    return prisma.loginSecurityState.findUnique({
      where: { identifierHash: lockoutKey('mfa', PHYSICIAN_ID) },
    });
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    service = new AccountLockoutService(prisma as never, new ConfigService({}));
  });

  afterAll(async () => {
    await clearRows();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearRows();
  });

  it('50 tentativas simultâneas: só 5 chegam a conferir o código', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => service.reserveAttempt('mfa', PHYSICIAN_ID)),
    );

    const allowed = results.filter((result) => result.status === 'fulfilled');
    const refused = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof AccountLockedException,
    );
    expect(allowed).toHaveLength(5);
    expect(refused).toHaveLength(45);

    const row = await mfaRow();
    expect(row?.failedCount).toBe(5);
    expect(row?.lockedUntil).not.toBeNull();
    expect(row?.physicianId).toBe(PHYSICIAN_ID);
  });

  it('5 tentativas sem acerto bloqueiam; o acerto antes do teto zera', async () => {
    for (let i = 0; i < 5; i += 1) await service.reserveAttempt('mfa', PHYSICIAN_ID);
    await service.clear('mfa', PHYSICIAN_ID);
    expect(await mfaRow()).toMatchObject({ failedCount: 0, lockedUntil: null });

    for (let i = 0; i < 5; i += 1) await service.reserveAttempt('mfa', PHYSICIAN_ID);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow(
      AccountLockedException,
    );
    expect((await mfaRow())?.lockedUntil).not.toBeNull();
    // Troca de senha tem contador próprio: o bloqueio do MFA não a afeta.
    await expect(service.reserveAttempt('password_change', PHYSICIAN_ID)).resolves.toBeUndefined();
  });

  it('bloqueio vencido recomeça a contagem', async () => {
    for (let i = 0; i < 5; i += 1) await service.reserveAttempt('mfa', PHYSICIAN_ID);
    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).rejects.toThrow(
      AccountLockedException,
    );
    await prisma.loginSecurityState.update({
      where: { identifierHash: lockoutKey('mfa', PHYSICIAN_ID) },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    await expect(service.reserveAttempt('mfa', PHYSICIAN_ID)).resolves.toBeUndefined();
    expect(await mfaRow()).toMatchObject({ failedCount: 1, lockedUntil: null });
  });
});
