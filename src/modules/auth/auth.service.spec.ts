import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmVerificationService } from '../physicians/crm-verification.service';
import { CrmCheckerService } from '../physicians/crm-checker.service';
import { ExternalIdentityService } from './oauth/external-identity.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { BetaInviteService, type BetaAdmission } from '../beta/beta-invite.service';
import { BetaInviteRequiredException } from '../beta/beta.errors';

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
      update: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let lockout: {
    reserveAttempt: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    reserveLoginAttempt: ReturnType<typeof vi.fn>;
    clearLogin: ReturnType<typeof vi.fn>;
  };
  let jwt: JwtService;
  let auditService: { log: ReturnType<typeof vi.fn> };
  let betaInvites: {
    admit: ReturnType<typeof vi.fn>;
    createAccount: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      physician: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      refreshToken: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
    };
    lockout = {
      reserveAttempt: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      reserveLoginAttempt: vi.fn().mockResolvedValue(true),
      clearLogin: vi.fn().mockResolvedValue(undefined),
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

    auditService = { log: vi.fn().mockResolvedValue(undefined) };

    const mfaService = {
      setupMfa: vi.fn(),
      enableMfa: vi.fn(),
      verifyMfaCode: vi.fn(),
      disableMfa: vi.fn(),
    } as unknown as MfaService;

    const crmVerificationService = {
      requestVerification: vi.fn().mockResolvedValue({}),
      approve: vi.fn().mockResolvedValue({}),
      reject: vi.fn().mockResolvedValue({}),
    } as unknown as CrmVerificationService;

    const crmCheckerService = {
      check: vi.fn().mockResolvedValue({ valid: false, source: 'unavailable' }),
    } as unknown as CrmCheckerService;

    // CC-702 — cadastro aberto por padrão; a regra do convite tem spec própria.
    betaInvites = {
      admit: vi.fn().mockResolvedValue({ kind: 'open' } satisfies BetaAdmission),
      createAccount: vi.fn((_admission: BetaAdmission, create: (db: unknown) => unknown) =>
        create(prisma),
      ),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      auditService as unknown as AuditService,
      // CC-025/CC-026 — os testes do limite por conta estão em auth.service.lockout.spec.ts.
      lockout as never,
      mfaService,
      betaInvites as unknown as BetaInviteService,
      crmVerificationService,
      crmCheckerService,
      { link: vi.fn() } as unknown as ExternalIdentityService,
    );
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
            role: true,
            locale: true,
            createdAt: true,
          },
        }),
      );
      expect(result).toHaveProperty('physician');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.physician).toEqual(mockPhysicianCreateResult);
    });

    // A trilha sobrevive à eliminação LGPD, que anonimiza o email no cadastro.
    it('audits AUTH_REGISTER without the email', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);
      prisma.physician.create.mockResolvedValue(mockPhysicianCreateResult);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

      await service.register({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
        crmUf: 'SP',
        crmNumber: '123456',
        name: 'Dr. Test',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_REGISTER',
          entityId: mockPhysician.id,
          payload: { crmUf: 'SP' },
        }),
      );
      expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('doctor@example.com');
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

    describe('beta por convite (CC-702)', () => {
      const input = {
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
        crmUf: 'SP',
        crmNumber: '123456',
        inviteCode: 'k3mq-9xpt',
      };

      it('checks the invite before hashing the password and creates the account through it', async () => {
        const admission: BetaAdmission = {
          kind: 'invite',
          inviteId: 'invite-1',
          batchLabel: 'rede Ripardo',
          waitlistEntryId: null,
        };
        prisma.physician.findUnique.mockResolvedValue(null);
        prisma.physician.create.mockResolvedValue(mockPhysicianCreateResult);
        betaInvites.admit.mockResolvedValue(admission);
        vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

        await service.register(input, '10.0.0.1');

        expect(betaInvites.admit).toHaveBeenCalledWith('k3mq-9xpt');
        expect(betaInvites.admit.mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(bcrypt.hash).mock.invocationCallOrder[0]!,
        );
        expect(betaInvites.createAccount).toHaveBeenCalledWith(
          admission,
          expect.any(Function),
          '10.0.0.1',
        );
        expect(prisma.physician.create).toHaveBeenCalledTimes(1);
      });

      it('creates nothing when the invite is refused', async () => {
        prisma.physician.findUnique.mockResolvedValue(null);
        betaInvites.admit.mockRejectedValue(new BetaInviteRequiredException());

        await expect(service.register({ ...input, inviteCode: undefined })).rejects.toThrow(
          BetaInviteRequiredException,
        );

        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(betaInvites.createAccount).not.toHaveBeenCalled();
        expect(prisma.physician.create).not.toHaveBeenCalled();
      });

      it('reports a duplicate email before looking at the invite', async () => {
        prisma.physician.findUnique.mockResolvedValue(mockPhysician);

        await expect(service.register(input)).rejects.toThrow(ConflictException);

        expect(betaInvites.admit).not.toHaveBeenCalled();
      });
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      prisma.physician.findUnique.mockResolvedValue(mockPhysician);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('StrongP@ss1', 'hashed-password');
      expect(result).toHaveProperty('physician');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(lockout.clearLogin).toHaveBeenCalledWith('doctor@example.com');
      if (!('physician' in result)) throw new Error('Expected non-MFA login result');
      expect(result.physician).toEqual({
        id: mockPhysician.id,
        email: mockPhysician.email,
        crmUf: mockPhysician.crmUf,
        crmNumber: mockPhysician.crmNumber,
        name: mockPhysician.name,
        crmVerified: mockPhysician.crmVerified,
        hasPassword: true,
      });
    });

    it('tells the web whether the physician reviews knowledge cards (CC-404)', async () => {
      prisma.physician.findUnique.mockResolvedValue({ ...mockPhysician, isCardReviewer: true });
      prisma.loginSecurityState.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
      });

      if (!('physician' in result)) throw new Error('Expected non-MFA login result');
      expect(result.physician.isCardReviewer).toBe(true);
    });

    it('rejects wrong password with UnauthorizedException', async () => {
      prisma.physician.findUnique.mockResolvedValue(mockPhysician);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login({
          email: 'doctor@example.com',
          password: 'WrongPassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(lockout.reserveLoginAttempt).toHaveBeenCalledWith(
        'doctor@example.com',
        mockPhysician.id,
      );
      expect(lockout.clearLogin).not.toHaveBeenCalled();
    });

    it('rejects non-existent email with UnauthorizedException', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'SomePassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(lockout.reserveLoginAttempt).toHaveBeenCalledWith('nonexistent@example.com', null);
    });
  });

  // CC-334 — conta criada pelo login com Google/Microsoft não tem senha.
  describe('account without password', () => {
    it('refuses password login like a wrong password, counting the attempt', async () => {
      prisma.physician.findUnique.mockResolvedValue({ ...mockPhysician, passwordHash: null });

      await expect(
        service.login({ email: 'doctor@example.com', password: 'StrongP@ss1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(lockout.reserveLoginAttempt).toHaveBeenCalledWith(
        'doctor@example.com',
        mockPhysician.id,
      );
      expect(lockout.clearLogin).not.toHaveBeenCalled();
    });

    it('reports hasPassword on /auth/me without leaking the hash', async () => {
      prisma.physician.findUnique.mockResolvedValue({ ...mockPhysician, passwordHash: null });

      const me = await service.getMe(mockPhysician.id);

      expect(me).toMatchObject({ id: mockPhysician.id, hasPassword: false });
      expect(me).not.toHaveProperty('passwordHash');
    });

    it('explains that there is no password to change', async () => {
      prisma.physician.findUnique.mockResolvedValue({ id: mockPhysician.id, passwordHash: null });

      await expect(
        service.changePassword(mockPhysician.id, 'qualquer', 'NovaSenha@1'),
      ).rejects.toThrow(BadRequestException);
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

    // CC-018 — a eliminação apaga os refresh tokens, mas um refresh que leu o
    // token antes dela pode ter gravado um novo depois.
    it('rejects a valid refresh token of an erased physician without issuing tokens', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        ...mockRefreshToken,
        physician: { ...mockPhysician, erasedAt: new Date('2026-10-15T12:00:00Z') },
      });

      await expect(service.refresh({ refreshToken: 'valid-refresh-token' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('keeps rotating for a physician who was never erased (erasedAt null)', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        ...mockRefreshToken,
        physician: { ...mockPhysician, erasedAt: null },
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      await expect(
        service.refresh({ refreshToken: 'valid-refresh-token' }),
      ).resolves.toHaveProperty('accessToken');
    });
  });

  // SEC-01 — regression test for the MFA-bypass fix: the mfa_pending token
  // issued mid-login (before the 2nd factor is verified) must be signed
  // with a secret DIFFERENT from JWT_ACCESS_SECRET. Otherwise a token
  // obtained from a password-only login could be replayed as a full
  // session (Authorization: Bearer <mfaToken>) on any JwtAuthGuard route,
  // skipping MFA entirely. Uses a real JwtService (not the signAsync mock
  // from the top-level beforeEach) so the cryptographic signature is real.
  describe('mfa_pending token isolation (SEC-01)', () => {
    const accessSecret = 'test-access-secret-at-least-32-characters-long';
    const refreshSecret = 'test-refresh-secret-at-least-32-characters-long';

    function buildServiceWithRealJwt() {
      const realJwt = new JwtService({});
      const realPrisma = {
        physician: { findUnique: vi.fn(), create: vi.fn() },
        refreshToken: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
      };
      const realConfig = new ConfigService({
        JWT_ACCESS_SECRET: accessSecret,
        JWT_REFRESH_SECRET: refreshSecret,
      });
      const realAudit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
      const realMfa = {
        verifyMfaCode: vi.fn().mockResolvedValue(undefined),
      } as unknown as MfaService;
      const crmVerification = {} as unknown as CrmVerificationService;
      const crmChecker = {} as unknown as CrmCheckerService;
      const betaInviteService = {} as unknown as BetaInviteService;

      const authService = new AuthService(
        realPrisma as unknown as PrismaService,
        realJwt,
        realConfig,
        realAudit,
        { reserveLoginAttempt: vi.fn().mockResolvedValue(true), clearLogin: vi.fn() } as never,
        realMfa,
        betaInviteService,
        crmVerification,
        crmChecker,
        { link: vi.fn() } as unknown as ExternalIdentityService,
      );

      return { authService, realJwt, realPrisma };
    }

    it('signs the mfaToken with a secret that is NOT JWT_ACCESS_SECRET', async () => {
      const { authService, realJwt, realPrisma } = buildServiceWithRealJwt();
      realPrisma.physician.findUnique.mockResolvedValue({ ...mockPhysician, mfaEnabled: true });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.login({
        email: 'doctor@example.com',
        password: 'StrongP@ss1',
      });

      const mfaToken = (result as { mfaToken?: string }).mfaToken;
      if (typeof mfaToken !== 'string') throw new Error('Expected mfaRequired login result');

      // The exploit this fix closes: replaying mfaToken as a full session by
      // verifying it against the *access* secret must fail.
      await expect(realJwt.verifyAsync(mfaToken, { secret: accessSecret })).rejects.toThrow();

      // But verifyMfaLogin (which knows the dedicated mfa_pending secret)
      // must still accept it as part of the intended exchange flow.
      realPrisma.physician.findUnique.mockResolvedValue({
        ...mockPhysician,
        id: mockPhysician.id,
        mfaEnabled: true,
      });
      await expect(authService.verifyMfaLogin(mfaToken, '123456')).resolves.toHaveProperty(
        'accessToken',
      );
    });

    // CC-018 — o token de MFA pendente (5 min) emitido antes da eliminação
    // não vira sessão depois dela: a busca do cadastro exige erasedAt null.
    it('does not open a session for an erased physician holding an mfaToken', async () => {
      const { authService, realJwt, realPrisma } = buildServiceWithRealJwt();
      const mfaToken = await realJwt.signAsync(
        {
          sub: mockPhysician.id,
          email: mockPhysician.email,
          physicianId: mockPhysician.id,
          scope: 'mfa_pending',
        },
        {
          secret: createHmac('sha256', accessSecret).update('mfa_pending_token').digest('hex'),
          expiresIn: '5m',
        },
      );
      realPrisma.physician.findUnique.mockResolvedValue(null);

      await expect(authService.verifyMfaLogin(mfaToken, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(realPrisma.physician.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockPhysician.id, erasedAt: null } }),
      );
      expect(realPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an mfaToken signed with JWT_ACCESS_SECRET instead of the dedicated secret', async () => {
      const { authService, realJwt } = buildServiceWithRealJwt();

      // Simulates the pre-fix behavior / a forged token using the access secret.
      const forgedMfaToken = await realJwt.signAsync(
        {
          sub: mockPhysician.id,
          email: mockPhysician.email,
          physicianId: mockPhysician.id,
          scope: 'mfa_pending',
        },
        { secret: accessSecret, expiresIn: '5m' },
      );

      await expect(authService.verifyMfaLogin(forgedMfaToken, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // CC-014 — o onboarding manda a especialidade no PATCH /auth/me; antes ela
  // era descartada sem erro e GET /auth/me nunca a devolvia.
  describe('profile specialty', () => {
    it('saves the specialty and answers with the same profile as GET /auth/me', async () => {
      prisma.physician.update.mockResolvedValue({ id: mockPhysician.id });
      prisma.physician.findUnique.mockResolvedValue({
        id: mockPhysician.id,
        email: mockPhysician.email,
        crmUf: mockPhysician.crmUf,
        crmNumber: mockPhysician.crmNumber,
        name: mockPhysician.name,
        specialty: 'medicina_de_emergencia',
        crmVerified: false,
        role: 'ADMIN',
        mfaEnabled: true,
        subscriptionStatus: 'trial',
        locale: 'pt-BR',
        createdAt: mockPhysician.createdAt,
      });

      const updated = await service.updateProfile(mockPhysician.id, {
        name: 'Dra. Ana',
        specialty: 'medicina_de_emergencia',
      });

      expect(prisma.physician.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPhysician.id },
          data: { name: 'Dra. Ana', locale: undefined, specialty: 'medicina_de_emergencia' },
        }),
      );
      // A aba Perfil troca o médico da sessão por esta resposta: sem `role`,
      // o administrador virava médico na tela até o próximo login.
      expect(updated).toMatchObject({ specialty: 'medicina_de_emergencia', role: 'ADMIN' });
    });

    it('returns the specialty on GET /auth/me', async () => {
      prisma.physician.findUnique.mockResolvedValue({
        id: mockPhysician.id,
        specialty: 'pediatria',
      });

      const me = await service.getMe(mockPhysician.id);

      expect(prisma.physician.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ specialty: true }) }),
      );
      expect(me).toMatchObject({ specialty: 'pediatria' });
    });
  });

  // CC-014 — a tela de segurança passou a alcançar a troca de senha (chamava
  // POST, a rota é PATCH). Senha atual errada não pode ser 401: o web trata
  // 401 como sessão expirada e manda o médico para o login.
  describe('changePassword', () => {
    it('answers a wrong current password with 400, not 401', async () => {
      prisma.physician.findUnique.mockResolvedValue({
        id: mockPhysician.id,
        passwordHash: 'hashed-password',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const attempt = service.changePassword(mockPhysician.id, 'errada', 'NovaSenha@1');

      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.not.toThrow(UnauthorizedException);
      expect(prisma.physician.update).not.toHaveBeenCalled();
    });

    it('stores the new hash when the current password matches', async () => {
      prisma.physician.findUnique.mockResolvedValue({
        id: mockPhysician.id,
        passwordHash: 'hashed-password',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);

      await service.changePassword(mockPhysician.id, 'Atual@123', 'NovaSenha@1');

      expect(prisma.physician.update).toHaveBeenCalledWith({
        where: { id: mockPhysician.id },
        data: { passwordHash: 'new-hash' },
      });
    });
  });
});
