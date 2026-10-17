import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException, UnauthorizedException } from '@nestjs/common';
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
const IP = '203.0.113.7';

async function build() {
  const prisma = {
    physician: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn().mockResolvedValue({}) },
  };
  const lockout = {
    reserveAttempt: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    reserveLoginAttempt: vi.fn().mockResolvedValue(true),
    clearLogin: vi.fn().mockResolvedValue(undefined),
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
  return { service: moduleRef.get(AuthService), prisma, lockout, audit };
}

describe('CC-025/CC-026 — AuthService: limite por conta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // CC-026 — o login usa a mesma reserva atômica, com o contador por e-mail.
  // A atomicidade em si está no teste de integração (cc-026-*).
  describe('login', () => {
    const physician = {
      id: PHYSICIAN_ID,
      email: EMAIL,
      passwordHash: 'hashed-password',
      mfaEnabled: false,
      role: 'PHYSICIAN',
    };

    it('reserva a tentativa antes de conferir a senha e não zera na senha errada', async () => {
      const { service, prisma, lockout } = await build();
      prisma.physician.findUnique.mockResolvedValue(physician);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login({ email: EMAIL, password: 'wrong' }, IP)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(lockout.reserveLoginAttempt).toHaveBeenCalledWith(EMAIL, PHYSICIAN_ID);
      expect(vi.mocked(lockout.reserveLoginAttempt).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(bcrypt.compare).mock.invocationCallOrder[0]!,
      );
      expect(lockout.clearLogin).not.toHaveBeenCalled();
    });

    it('e-mail sem cadastro também conta, sem dono na linha', async () => {
      const { service, prisma, lockout } = await build();
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: EMAIL, password: 'any' }, IP)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(lockout.reserveLoginAttempt).toHaveBeenCalledWith(EMAIL, null);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('conta bloqueada: 401 igual a senha errada, sem conferir, e audita o motivo', async () => {
      const { service, prisma, lockout, audit } = await build();
      prisma.physician.findUnique.mockResolvedValue(physician);
      lockout.reserveLoginAttempt.mockResolvedValue(false);

      await expect(service.login({ email: EMAIL, password: 'right' }, IP)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith({
        actorId: PHYSICIAN_ID,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: PHYSICIAN_ID,
        payload: { reason: 'account_locked' },
        ip: IP,
      });
    });

    it('senha certa zera só o contador do login, não o do MFA', async () => {
      const { service, prisma, lockout } = await build();
      prisma.physician.findUnique.mockResolvedValue({ ...physician, mfaEnabled: true });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(service.login({ email: EMAIL, password: 'right' }, IP)).resolves.toMatchObject({
        mfaRequired: true,
      });

      expect(lockout.clearLogin).toHaveBeenCalledWith(EMAIL);
      // Quem ataca o MFA já tem a senha: o login certo não pode zerar o MFA.
      expect(lockout.clear).not.toHaveBeenCalled();
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
