import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { AccountLockedException, AccountLockoutService } from './account-lockout.service';

vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

const PHYSICIAN_ID = '550e8400-e29b-41d4-a716-446655440000';
const EMAIL = 'doctor@example.com';

async function build() {
  const prisma = {
    physician: { findUnique: vi.fn(), update: vi.fn() },
    loginSecurityState: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  };
  const lockout = {
    reserveAttempt: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
  });
  const audit = { log: vi.fn().mockResolvedValue(undefined) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: prisma },
      { provide: JwtService, useValue: new JwtService({}) },
      { provide: ConfigService, useValue: config },
      { provide: AuditService, useValue: audit },
      { provide: AccountLockoutService, useValue: lockout },
    ],
  })
    // As outras dependências (MFA, CRM…) não entram nestes caminhos; o mocker
    // também poupa este arquivo de mudar a cada dependência nova do AuthService.
    .useMocker(() => ({}))
    .compile();
  return { service: moduleRef.get(AuthService), prisma, lockout };
}

describe('CC-025 — AuthService: limite por conta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login bloqueado', () => {
    let warn: MockInstance<Logger['warn']>;

    beforeEach(() => {
      warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('loga AUTH_RATE_LIMITED reason=account sem e-mail nem id em claro', async () => {
      const { service, prisma } = await build();
      prisma.loginSecurityState.findUnique.mockResolvedValue({
        physicianId: PHYSICIAN_ID,
        failedCount: 5,
        lockedUntil: new Date(Date.now() + 60_000),
        lastFailedAt: new Date(),
      });

      await expect(service.login({ email: EMAIL, password: 'whatever' })).rejects.toThrow(
        UnauthorizedException,
      );

      const lines = warn.mock.calls.map(([message]) => String(message));
      expect(lines).toEqual([
        expect.stringMatching(
          /^AUTH_RATE_LIMITED reason=account scope=login subject=[0-9a-f]{12}$/,
        ),
      ]);
      expect(lines[0]).not.toContain(EMAIL);
      expect(lines[0]).not.toContain(PHYSICIAN_ID);
    });
  });

  describe('changePassword', () => {
    function withPhysician(prisma: Awaited<ReturnType<typeof build>>['prisma']) {
      prisma.physician.findUnique.mockResolvedValue({
        id: PHYSICIAN_ID,
        passwordHash: 'hashed-password',
      });
    }

    it('conta a tentativa antes de comparar e não zera quando a senha atual está errada', async () => {
      const { service, prisma, lockout } = await build();
      withPhysician(prisma);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      // O tipo do erro da senha errada não é deste teste: só que não é o bloqueio.
      const error = await service
        .changePassword(PHYSICIAN_ID, 'wrong', 'NewStrongP@ss1')
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(HttpException);
      expect(error).not.toBeInstanceOf(AccountLockedException);
      expect(lockout.reserveAttempt).toHaveBeenCalledWith('password_change', PHYSICIAN_ID);
      expect(vi.mocked(lockout.reserveAttempt).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(bcrypt.compare).mock.invocationCallOrder[0]!,
      );
      expect(lockout.clear).not.toHaveBeenCalled();
      expect(prisma.physician.update).not.toHaveBeenCalled();
    });

    it('conta bloqueada recusa com 429 sem comparar a senha', async () => {
      const { service, prisma, lockout } = await build();
      withPhysician(prisma);
      lockout.reserveAttempt.mockRejectedValue(new AccountLockedException());

      await expect(service.changePassword(PHYSICIAN_ID, 'right', 'NewStrongP@ss1')).rejects.toThrow(
        AccountLockedException,
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.physician.update).not.toHaveBeenCalled();
    });

    it('senha atual certa troca a senha e zera o contador', async () => {
      const { service, prisma, lockout } = await build();
      withPhysician(prisma);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);
      prisma.physician.update.mockResolvedValue({});

      await service.changePassword(PHYSICIAN_ID, 'right', 'NewStrongP@ss1');

      expect(lockout.clear).toHaveBeenCalledWith('password_change', PHYSICIAN_ID);
      expect(prisma.physician.update).toHaveBeenCalledWith({
        where: { id: PHYSICIAN_ID },
        data: { passwordHash: 'new-hash' },
      });
    });
  });
});
