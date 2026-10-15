/**
 * Testes de integração — CC-026: contador do login e código de backup do MFA
 * atômicos, contra PostgreSQL real.
 *
 * O teste unitário prova a ordem das chamadas; este prova o que só o banco
 * prova: com requisições em paralelo, o login não confere mais senhas do que
 * AUTH_LOCKOUT_MAX_ATTEMPTS, e um código de backup vale uma vez só.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com migrations aplicadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { generateSecret } from 'otplib';
import { connectTestDb, disconnectTestDb } from './helpers/db';
import { PrismaService } from '../../src/config/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { MfaService } from '../../src/modules/auth/mfa.service';
import { CryptoService } from '../../src/shared/crypto/crypto.service';
import {
  AccountLockoutService,
  lockoutKey,
  loginLockoutKey,
} from '../../src/modules/auth/account-lockout.service';

// Conta quantas tentativas chegam a conferir a senha, sem mudar o resultado.
vi.mock('bcryptjs', async (importOriginal) => {
  // bcryptjs é CommonJS: as funções vêm no `default`.
  const original = await importOriginal<{ default?: typeof import('bcryptjs') }>();
  const actual = original.default ?? (original as typeof import('bcryptjs'));
  return { ...actual, compare: vi.fn(actual.compare) };
});

const PHYSICIAN_ID = '00000000-0000-0000-0000-0000000c0026';
const EMAIL = 'cc026-atomicidade@example.com';
const PASSWORD = 'SenhaCerta@2026';
const KEYS = [
  loginLockoutKey(EMAIL),
  lockoutKey('mfa', PHYSICIAN_ID),
  lockoutKey('password_change', PHYSICIAN_ID),
];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('CC-026 — login e código de backup atômicos (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let lockout: AccountLockoutService;
  let auth: AuthService;
  let mfa: MfaService;
  const audit = { log: vi.fn().mockResolvedValue(undefined) };

  async function clearCounters() {
    await prisma.loginSecurityState.deleteMany({ where: { identifierHash: { in: KEYS } } });
  }

  async function loginRow() {
    return prisma.loginSecurityState.findUnique({
      where: { identifierHash: loginLockoutKey(EMAIL) },
    });
  }

  function auditReasons(): unknown[] {
    return audit.log.mock.calls.map(
      ([params]) => (params as { payload?: { reason?: unknown } }).payload?.reason,
    );
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    await prisma.physician.deleteMany({ where: { id: PHYSICIAN_ID } });
    await prisma.physician.create({
      data: {
        id: PHYSICIAN_ID,
        email: EMAIL,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        crmUf: 'SP',
        crmNumber: '260260',
        mfaEnabled: true,
        // O CryptoService falso abaixo devolve o texto sem o prefixo.
        mfaSecret: `enc:${generateSecret()}`,
      },
    });

    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'integration-access-secret-at-least-32-chars',
      JWT_REFRESH_SECRET: 'integration-refresh-secret-at-least-32-chars',
    });
    lockout = new AccountLockoutService(prisma as unknown as PrismaService, config);
    const crypto = { decrypt: (value: string) => value.replace(/^enc:/, '') };
    mfa = new MfaService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      audit as unknown as AuditService,
      lockout,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: new JwtService({}) },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
        { provide: AccountLockoutService, useValue: lockout },
        { provide: MfaService, useValue: mfa },
      ],
    })
      // CRM e o que mais vier no construtor não entram no login.
      .useMocker(() => ({}))
      .compile();
    auth = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await clearCounters();
    await prisma.physician.deleteMany({ where: { id: PHYSICIAN_ID } });
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearCounters();
    vi.mocked(bcrypt.compare).mockClear();
    audit.log.mockClear();
  });

  describe('login', () => {
    it('50 logins simultâneos com senha errada: só 5 conferem a senha e a conta bloqueia', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 50 }, () => auth.login({ email: EMAIL, password: 'errada' })),
      );

      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      expect(
        results.every((r) => r.status === 'rejected' && r.reason instanceof UnauthorizedException),
      ).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledTimes(5);
      expect(auditReasons().filter((reason) => reason === 'invalid_password')).toHaveLength(5);
      expect(auditReasons().filter((reason) => reason === 'account_locked')).toHaveLength(45);

      const row = await loginRow();
      expect(row).toMatchObject({ failedCount: 5, physicianId: PHYSICIAN_ID });
      expect(row?.lockedUntil).not.toBeNull();

      // Bloqueada, nem a senha certa entra, e ela nem é conferida.
      vi.mocked(bcrypt.compare).mockClear();
      await expect(auth.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('e-mail com caixa e espaços diferentes cai no mesmo contador', async () => {
      for (let i = 0; i < 5; i += 1) {
        await expect(
          auth.login({ email: ` CC026-Atomicidade@Example.com `, password: 'errada' }),
        ).rejects.toThrow(UnauthorizedException);
      }
      expect((await loginRow())?.failedCount).toBe(5);
    });

    it('a senha certa zera o contador do login, mas não o do MFA', async () => {
      for (let i = 0; i < 6; i += 1) {
        await lockout.reserveAttempt('mfa', PHYSICIAN_ID).catch(() => undefined);
      }
      for (let i = 0; i < 3; i += 1) {
        await expect(auth.login({ email: EMAIL, password: 'errada' })).rejects.toThrow();
      }

      await expect(auth.login({ email: EMAIL, password: PASSWORD })).resolves.toMatchObject({
        mfaRequired: true,
      });

      expect(await loginRow()).toMatchObject({ failedCount: 0, lockedUntil: null });
      const mfaRow = await prisma.loginSecurityState.findUnique({
        where: { identifierHash: lockoutKey('mfa', PHYSICIAN_ID) },
      });
      expect(mfaRow?.lockedUntil).not.toBeNull();
    });
  });

  describe('código de backup do MFA', () => {
    async function newBackupCode(code: string) {
      await prisma.mfaBackupCode.deleteMany({ where: { physicianId: PHYSICIAN_ID } });
      await prisma.mfaBackupCode.create({
        data: { physicianId: PHYSICIAN_ID, codeHash: sha256(code) },
      });
    }

    it('2 pedidos simultâneos com o mesmo código: só 1 passa', async () => {
      await newBackupCode('cc026aa1');

      const results = await Promise.allSettled([
        mfa.verifyMfaCode(PHYSICIAN_ID, 'cc026aa1'),
        mfa.verifyMfaCode(PHYSICIAN_ID, 'cc026aa1'),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refused = results.filter((r) => r.status === 'rejected');
      expect(refused).toHaveLength(1);
      expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException);

      const codes = await prisma.mfaBackupCode.findMany({ where: { physicianId: PHYSICIAN_ID } });
      expect(codes).toHaveLength(1);
      expect(codes[0]?.usedAt).not.toBeNull();
    });

    it('repetido 20 vezes com códigos novos: nunca passam os dois', async () => {
      for (let round = 0; round < 20; round += 1) {
        await clearCounters();
        const code = `cc026r${String(round).padStart(2, '0')}`;
        await newBackupCode(code);

        const results = await Promise.allSettled([
          mfa.verifyMfaCode(PHYSICIAN_ID, code),
          mfa.verifyMfaCode(PHYSICIAN_ID, code),
        ]);

        expect(
          results.filter((r) => r.status === 'fulfilled'),
          `rodada ${round}`,
        ).toHaveLength(1);
      }
    });

    it('código já usado é recusado depois', async () => {
      await newBackupCode('cc026bb2');
      await expect(mfa.verifyMfaCode(PHYSICIAN_ID, 'cc026bb2')).resolves.toBeUndefined();
      await expect(mfa.verifyMfaCode(PHYSICIAN_ID, 'cc026bb2')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
