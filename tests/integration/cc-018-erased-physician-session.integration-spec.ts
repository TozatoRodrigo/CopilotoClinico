/**
 * Testes de integração — CC-018: a eliminação LGPD encerra a sessão.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com as migrations
 * aplicadas (inclusive 20261015130000_cc_018_physician_erased_at).
 *
 * Cobre o que os testes unitários não alcançam: a eliminação grava
 * `physicians.erased_at` de verdade, e as consultas da estratégia JWT, do
 * refresh e do login com MFA leem esse marcador no Postgres. A sessão é
 * conferida numa "segunda instância da API" (checagem sem a marca em
 * memória), então o que recusa o token ali é o banco.
 */
import { createHash, createHmac } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AccountLockoutService } from '../../src/modules/auth/account-lockout.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PhysicianErasureCheck } from '../../src/modules/auth/physician-erasure-check.service';
import { JwtStrategy } from '../../src/modules/auth/strategies/jwt.strategy';
import { LgpdService } from '../../src/modules/lgpd/lgpd.service';
import type { MfaService } from '../../src/modules/auth/mfa.service';
import type { CrmVerificationService } from '../../src/modules/physicians/crm-verification.service';
import type { CrmCheckerService } from '../../src/modules/physicians/crm-checker.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { StorageService } from '../../src/modules/storage/storage.service';

const ACCESS_SECRET = 'cc018-access-secret-at-least-32-characters-long';
const REFRESH_SECRET = 'cc018-refresh-secret-at-least-32-characters-long';
const PASSWORD = 'Senha@CC018';

interface Session {
  accessToken: string;
  refreshToken: string;
}

describe('CC-018 — eliminação LGPD encerra a sessão (integration)', () => {
  let prisma: PrismaClient;
  let jwt: JwtService;
  let config: ConfigService;
  let authService: AuthService;
  let erasedId: string;
  let keptId: string;
  let erasedSession: Session;
  let keptSession: Session;
  /** A instância da API que atende a eliminação. */
  let sameInstanceStrategy: JwtStrategy;

  /** Outra instância da API: cache vazio, só o banco sabe da eliminação. */
  function otherInstanceStrategy(): JwtStrategy {
    return new JwtStrategy(config, new PhysicianErasureCheck(prisma as unknown as PrismaService));
  }

  /** Assinatura e exp como o passport-jwt confere, depois o validate. */
  async function authenticate(strategy: JwtStrategy, accessToken: string) {
    const payload = await jwt.verifyAsync(accessToken, { secret: ACCESS_SECRET });
    return strategy.validate(payload);
  }

  async function login(email: string): Promise<Session> {
    const result = await authService.login({ email, password: PASSWORD });
    if (!('accessToken' in result)) throw new Error('login sem MFA deveria devolver tokens');
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  beforeAll(async () => {
    prisma = await connectTestDb();
    jwt = new JwtService({});
    config = new ConfigService({
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: REFRESH_SECRET,
    });
    const audit = new AuditService(prisma as unknown as PrismaService);
    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      audit,
      new AccountLockoutService(prisma as unknown as PrismaService, config),
      // O login com MFA só chega à busca do cadastro se o código conferir.
      { verifyMfaCode: async () => undefined } as unknown as MfaService,
      {} as CrmVerificationService,
      {} as CrmCheckerService,
    );

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const stamp = Date.now();
    const [erased, kept] = await Promise.all(
      ['eliminado', 'mantido'].map((who) =>
        prisma.physician.create({
          data: {
            email: `${who}-${stamp}@cc018.test`,
            passwordHash,
            crmUf: 'SP',
            crmNumber: '000018',
          },
        }),
      ),
    );
    erasedId = erased!.id;
    keptId = kept!.id;
    erasedSession = await login(erased!.email);
    keptSession = await login(kept!.email);

    const sameInstanceCheck = new PhysicianErasureCheck(prisma as unknown as PrismaService);
    sameInstanceStrategy = new JwtStrategy(config, sameInstanceCheck);
    // Antes da eliminação o token vale, e a instância guarda "não eliminado".
    await expect(authenticate(sameInstanceStrategy, erasedSession.accessToken)).resolves.toEqual(
      expect.objectContaining({ physicianId: erasedId }),
    );

    // O médico eliminado não tem documento: não há PDF a apagar no storage.
    const noStorage = { deleteObjects: async () => undefined } as unknown as StorageService;
    const lgpd = new LgpdService(
      prisma as unknown as PrismaService,
      audit,
      sameInstanceCheck,
      noStorage,
    );
    await lgpd.requestErasure(erasedId);
  });

  afterAll(async () => {
    const ids = [erasedId, keptId].filter(Boolean);
    await prisma.loginSecurityState.deleteMany({ where: { physicianId: { in: ids } } });
    await prisma.physician.deleteMany({ where: { id: { in: ids } } });
    await clearAuditLog(prisma);
    await disconnectTestDb();
  });

  it('a eliminação grava erased_at e não toca no outro médico', async () => {
    const rows = await prisma.physician.findMany({
      where: { id: { in: [erasedId, keptId] } },
      select: { id: true, erasedAt: true },
    });

    expect(rows.find((row) => row.id === erasedId)?.erasedAt).toBeInstanceOf(Date);
    expect(rows.find((row) => row.id === keptId)?.erasedAt).toBeNull();
  });

  it('o access token do médico eliminado, assinado e dentro do exp, recebe 401', async () => {
    // O token em si continua íntegro: quem o recusa é a checagem.
    await expect(
      jwt.verifyAsync(erasedSession.accessToken, { secret: ACCESS_SECRET }),
    ).resolves.toBeDefined();

    // Na instância que eliminou, a marca vale na hora, apesar do cache.
    await expect(authenticate(sameInstanceStrategy, erasedSession.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    // Em outra instância, o banco recusa.
    await expect(authenticate(otherInstanceStrategy(), erasedSession.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('o refresh do médico eliminado é recusado', async () => {
    await expect(authService.refresh({ refreshToken: erasedSession.refreshToken })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('o refresh token gravado depois da eliminação também é recusado', async () => {
    // Um refresh que leu o token antes da eliminação grava um novo depois dela.
    const lateRefreshToken = await jwt.signAsync(
      { sub: erasedId, email: 'x', physicianId: erasedId, role: 'PHYSICIAN' },
      { secret: REFRESH_SECRET, expiresIn: '7d' },
    );
    await prisma.refreshToken.create({
      data: {
        physicianId: erasedId,
        tokenHash: createHash('sha256').update(lateRefreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(authService.refresh({ refreshToken: lateRefreshToken })).rejects.toThrow(
      UnauthorizedException,
    );
    await prisma.refreshToken.deleteMany({ where: { physicianId: erasedId } });
  });

  it('o token de MFA pendente emitido antes da eliminação não vira sessão', async () => {
    const mfaToken = await jwt.signAsync(
      { sub: erasedId, email: 'x', physicianId: erasedId, scope: 'mfa_pending' },
      {
        secret: createHmac('sha256', ACCESS_SECRET).update('mfa_pending_token').digest('hex'),
        expiresIn: '5m',
      },
    );

    await expect(authService.verifyMfaLogin(mfaToken, '123456')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(await prisma.refreshToken.count({ where: { physicianId: erasedId } })).toBe(0);
  });

  it('o outro médico segue autenticando e renovando a sessão', async () => {
    await expect(authenticate(otherInstanceStrategy(), keptSession.accessToken)).resolves.toEqual(
      expect.objectContaining({ physicianId: keptId }),
    );
    await expect(authenticate(sameInstanceStrategy, keptSession.accessToken)).resolves.toEqual(
      expect.objectContaining({ physicianId: keptId }),
    );

    const renewed = await authService.refresh({ refreshToken: keptSession.refreshToken });
    await expect(authenticate(otherInstanceStrategy(), renewed.accessToken)).resolves.toEqual(
      expect.objectContaining({ physicianId: keptId }),
    );
  });
});
