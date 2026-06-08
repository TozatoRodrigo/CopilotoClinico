import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

const mockPhysician = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'doctor@example.com',
  crmUf: 'SP',
  crmNumber: '123456',
  name: 'Dr. Test',
  passwordHash: 'hashed-password',
  crmVerified: false,
  mfaEnabled: false,
  createdAt: new Date('2025-01-01'),
};

const mockPhysicianCreateResult = {
  id: mockPhysician.id,
  email: mockPhysician.email,
  crmUf: mockPhysician.crmUf,
  crmNumber: mockPhysician.crmNumber,
  name: mockPhysician.name,
  createdAt: mockPhysician.createdAt,
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    physician: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    loginSecurityState: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jwt: JwtService;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      physician: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      refreshToken: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
      loginSecurityState: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    };

    jwt = new JwtService({});
    vi.spyOn(jwt, 'signAsync').mockResolvedValue('mock-token');
    vi.spyOn(jwt, 'decode').mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 86400 });

    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
    });

    const auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const mfaService = {
      setupMfa: vi.fn(),
      enableMfa: vi.fn(),
      verifyMfaCode: vi.fn(),
      disableMfa: vi.fn(),
    } as unknown as MfaService;

    service = new AuthService(prisma as unknown as PrismaService, jwt, config, auditService, mfaService);
  });

  describe('register', () => {
    it('creates a physician and returns tokens', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);
      prisma.physician.create.mockResolvedValue(mockPhysicianCreateResult);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

      const result = await service.register({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
        crmUf: 'SP',
        crmNumber: '123456',
        name: 'Dr. Test',
      });

      expect(prisma.physician.findUnique).toHaveBeenCalledWith({
        where: { email: 'doctor@example.com' },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('StrongP@ss1', 12);
      expect(prisma.physician.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'doctor@example.com',
            passwordHash: 'hashed-password',
            crmUf: 'SP',
            crmNumber: '123456',
            name: 'Dr. Test',
          }),
          select: {
            id: true,
            email: true,
            crmUf: true,
            crmNumber: true,
            crmVerified: true,
            name: true,
            createdAt: true,
          },
        }),
      );
      expect(result).toHaveProperty('physician');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.physician).toEqual(mockPhysicianCreateResult);
    });

    it('creates a physician without optional name', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);
      prisma.physician.create.mockResolvedValue({
        ...mockPhysicianCreateResult,
        name: undefined,
      });
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

      const result = await service.register({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
        crmUf: 'SP',
        crmNumber: '123456',
      });

      expect(result).toHaveProperty('physician');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('rejects duplicate email with ConflictException', async () => {
      prisma.physician.findUnique.mockResolvedValue(mockPhysician);

      await expect(
        service.register({
          email: 'doctor@example.com',
          password: 'StrongP@ss1',
          crmUf: 'SP',
          crmNumber: '123456',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.physician.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      prisma.physician.findUnique.mockResolvedValue(mockPhysician);
      prisma.loginSecurityState.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('StrongP@ss1', 'hashed-password');
      expect(result).toHaveProperty('physician');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(prisma.loginSecurityState.update).not.toHaveBeenCalled();
      if (!('physician' in result)) throw new Error('Expected non-MFA login result');
      expect(result.physician).toEqual({
        id: mockPhysician.id,
        email: mockPhysician.email,
        crmUf: mockPhysician.crmUf,
        crmNumber: mockPhysician.crmNumber,
        name: mockPhysician.name,
        crmVerified: mockPhysician.crmVerified,
      });
    });

    it('rejects wrong password with UnauthorizedException', async () => {
      prisma.physician.findUnique.mockResolvedValue(mockPhysician);
      prisma.loginSecurityState.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login({
          email: 'doctor@example.com',
          password: 'WrongPassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.loginSecurityState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            identifierHash: expect.any(String),
          },
          create: expect.objectContaining({
            failedCount: 1,
            physicianId: mockPhysician.id,
            lockedUntil: null,
          }),
        }),
      );
    });

    it('rejects non-existent email with UnauthorizedException', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);
      prisma.loginSecurityState.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'SomePassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.loginSecurityState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            failedCount: 1,
            physicianId: null,
            lockedUntil: null,
          }),
        }),
      );
    });

    it('locks login after the configured number of failed attempts', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));

      try {
        prisma.physician.findUnique.mockResolvedValue(mockPhysician);
        prisma.loginSecurityState.findUnique.mockResolvedValue({
          identifierHash: 'hash',
          physicianId: mockPhysician.id,
          failedCount: 4,
          lockedUntil: null,
          lastFailedAt: new Date('2026-06-06T11:59:00.000Z'),
        });
        vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

        await expect(
          service.login({
            email: 'doctor@example.com',
            password: 'WrongPassword1!',
          }),
        ).rejects.toThrow(UnauthorizedException);

        expect(prisma.loginSecurityState.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              failedCount: 5,
              lockedUntil: new Date('2026-06-06T12:15:00.000Z'),
            }),
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects locked accounts before comparing passwords', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));

      try {
        prisma.loginSecurityState.findUnique.mockResolvedValue({
          identifierHash: 'hash',
          physicianId: mockPhysician.id,
          failedCount: 5,
          lockedUntil: new Date('2026-06-06T12:10:00.000Z'),
          lastFailedAt: new Date('2026-06-06T11:59:00.000Z'),
        });

        await expect(
          service.login({
            email: 'doctor@example.com',
            password: 'StrongP@ss1',
          }),
        ).rejects.toThrow(UnauthorizedException);

        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(prisma.physician.findUnique).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears failed login state after a successful login', async () => {
      prisma.physician.findUnique.mockResolvedValue(mockPhysician);
      prisma.loginSecurityState.findUnique.mockResolvedValue({
        identifierHash: 'hash',
        physicianId: mockPhysician.id,
        failedCount: 2,
        lockedUntil: null,
        lastFailedAt: new Date('2026-06-06T11:59:00.000Z'),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await service.login({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
      });

      expect(prisma.loginSecurityState.update).toHaveBeenCalledWith({
        where: { identifierHash: expect.any(String) },
        data: {
          failedCount: 0,
          lockedUntil: null,
          lastFailedAt: null,
          physicianId: mockPhysician.id,
        },
      });
    });
  });

  describe('logout', () => {
    it('revokes the provided refresh token', async () => {
      prisma.refreshToken.update = vi.fn();
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      prisma.refreshToken.updateMany = updateMany;

      await service.logout(mockPhysician.id, 'some-refresh-token');

      expect(updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          physicianId: mockPhysician.id,
          revoked: false,
        }),
        data: { revoked: true },
      });
    });

    it('succeeds without a refresh token (idempotent)', async () => {
      await expect(service.logout(mockPhysician.id)).resolves.toBeUndefined();
    });

    it('succeeds even if token revocation fails (idempotent)', async () => {
      prisma.refreshToken.updateMany = vi.fn().mockRejectedValue(new Error('db error'));
      await expect(service.logout(mockPhysician.id, 'bad-token')).resolves.toBeUndefined();
    });
  });

  describe('refresh', () => {
    const mockRefreshToken = {
      id: 'token-uuid',
      physicianId: mockPhysician.id,
      tokenHash: 'some-hash',
      expiresAt: new Date(Date.now() + 86400000),
      revoked: false,
      physician: mockPhysician,
    };

    it('rotates refresh token and returns new tokens', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(mockRefreshToken);
      prisma.refreshToken.update.mockResolvedValue({ ...mockRefreshToken, revoked: true });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh({ refreshToken: 'valid-refresh-token' });

      expect(prisma.refreshToken.findFirst).toHaveBeenCalled();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshToken.id },
        data: { revoked: true },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('rejects revoked token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        ...mockRefreshToken,
        revoked: true,
      });

      await expect(service.refresh({ refreshToken: 'revoked-token' })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rejects expired token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 86400000),
      });

      await expect(service.refresh({ refreshToken: 'expired-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects unknown token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: 'unknown-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
