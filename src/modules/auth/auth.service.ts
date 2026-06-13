import {
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterInput, LoginInput, RefreshInput } from './schemas/auth.schemas';
import { MfaService } from './mfa.service';
import { CrmVerificationService } from '../physicians/crm-verification.service';
import { CrmCheckerService } from '../physicians/crm-checker.service';

const MFA_PENDING_SCOPE = 'mfa_pending' as const;
const MFA_TOKEN_EXPIRY = '5m';

type JwtExpiry = NonNullable<JwtSignOptions['expiresIn']>;

const DEFAULT_LOGIN_LOCKOUT_MAX_ATTEMPTS = 5;
const DEFAULT_LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiry: JwtExpiry;
  private readonly refreshExpiry: JwtExpiry;
  private readonly loginLockoutMaxAttempts: number;
  private readonly loginLockoutWindowMs: number;
  private readonly loginLockoutDurationMs: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(MfaService) private readonly mfaService: MfaService,
    @Inject(CrmVerificationService) private readonly crmVerification: CrmVerificationService,
    @Inject(CrmCheckerService) private readonly crmChecker: CrmCheckerService,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY', '15m') as unknown as JwtExpiry;
    this.refreshExpiry = this.config.get<string>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    ) as unknown as JwtExpiry;
    this.loginLockoutMaxAttempts = this.getPositiveNumberConfig(
      'AUTH_LOCKOUT_MAX_ATTEMPTS',
      DEFAULT_LOGIN_LOCKOUT_MAX_ATTEMPTS,
    );
    this.loginLockoutWindowMs = this.getPositiveNumberConfig(
      'AUTH_LOCKOUT_WINDOW_MS',
      DEFAULT_LOGIN_LOCKOUT_WINDOW_MS,
    );
    this.loginLockoutDurationMs = this.getPositiveNumberConfig(
      'AUTH_LOCKOUT_DURATION_MS',
      DEFAULT_LOGIN_LOCKOUT_DURATION_MS,
    );
  }

  async register(input: RegisterInput, ip?: string) {
    const existing = await this.prisma.physician.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const physician = await this.prisma.physician.create({
      data: {
        email: input.email,
        passwordHash,
        crmUf: input.crmUf,
        crmNumber: input.crmNumber,
        name: input.name,
      },
      select: {
        id: true,
        email: true,
        crmUf: true,
        crmNumber: true,
        name: true,
        crmVerified: true,
        createdAt: true,
      },
    });

    await this.auditSilently({
      actorId: physician.id,
      action: 'AUTH_REGISTER',
      entity: 'Physician',
      entityId: physician.id,
      payload: { email: physician.email, crmUf: physician.crmUf },
      ip,
    });

    setImmediate(() => {
      this.runCrmAutoVerification(
        physician.id,
        physician.crmUf as string,
        physician.crmNumber as string,
      ).catch((err) => this.logger.error('CRM auto-verification failed', err));
    });

    const tokens = await this.generateTokens(physician.id, physician.email);
    return { physician, ...tokens };
  }

  async login(input: LoginInput, ip?: string) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const identifierHash = this.hashLoginIdentifier(normalizedEmail);
    const securityState = await this.prisma.loginSecurityState.findUnique({
      where: { identifierHash },
    });

    if (securityState?.lockedUntil && securityState.lockedUntil > new Date()) {
      await this.auditSilently({
        actorId: securityState.physicianId ?? 'unknown',
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: securityState.physicianId ?? 'unknown',
        payload: { reason: 'account_locked' },
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const physician = await this.prisma.physician.findUnique({
      where: { email: input.email },
    });

    if (!physician) {
      await this.recordFailedLogin(identifierHash, null, securityState);
      await this.auditSilently({
        actorId: 'unknown',
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: 'unknown',
        payload: { reason: 'physician_not_found' },
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(input.password, physician.passwordHash);
    if (!passwordValid) {
      await this.recordFailedLogin(identifierHash, physician.id, securityState);
      await this.auditSilently({
        actorId: physician.id,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: physician.id,
        payload: { reason: 'invalid_password' },
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (securityState) {
      await this.prisma.loginSecurityState.update({
        where: { identifierHash },
        data: {
          failedCount: 0,
          lockedUntil: null,
          lastFailedAt: null,
          physicianId: physician.id,
        },
      });
    }

    if (physician.mfaEnabled) {
      const mfaToken = await this.issueMfaPendingToken(physician.id, physician.email);
      await this.auditSilently({
        actorId: physician.id,
        action: 'AUTH_LOGIN_MFA_REQUIRED',
        entity: 'Physician',
        entityId: physician.id,
        ip,
      });
      return { mfaRequired: true, mfaToken };
    }

    await this.auditSilently({
      actorId: physician.id,
      action: 'AUTH_LOGIN',
      entity: 'Physician',
      entityId: physician.id,
      ip,
    });

    const tokens = await this.generateTokens(physician.id, physician.email);
    return {
      mfaRequired: false,
      physician: {
        id: physician.id,
        email: physician.email,
        crmUf: physician.crmUf,
        crmNumber: physician.crmNumber,
        name: physician.name,
        crmVerified: physician.crmVerified,
      },
      ...tokens,
    };
  }

  async verifyMfaLogin(mfaToken: string, code: string, ip?: string) {
    let physicianId: string;
    let email: string;

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        physicianId: string;
        scope: string;
      }>(mfaToken, { secret: this.accessSecret });

      if (payload.scope !== MFA_PENDING_SCOPE) {
        throw new Error('Invalid token scope');
      }

      physicianId = payload.physicianId;
      email = payload.email;
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    await this.mfaService.verifyMfaCode(physicianId, code, ip);

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_LOGIN',
      entity: 'Physician',
      entityId: physicianId,
      payload: { mfa: true },
      ip,
    });

    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: {
        id: true,
        email: true,
        crmUf: true,
        crmNumber: true,
        name: true,
        crmVerified: true,
      },
    });

    if (!physician) throw new UnauthorizedException('Physician not found');

    const tokens = await this.generateTokens(physicianId, email);
    return { mfaRequired: false, physician, ...tokens };
  }

  private async issueMfaPendingToken(physicianId: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: physicianId, email, physicianId, scope: MFA_PENDING_SCOPE },
      { secret: this.accessSecret, expiresIn: MFA_TOKEN_EXPIRY },
    );
  }

  assertMfaNotRequired(mfaEnabled: boolean): void {
    if (mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }
  }

  async refresh(input: RefreshInput & { refreshToken: string }, ip?: string) {
    const tokenHash = this.hashToken(input.refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { physician: true },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    await this.auditSilently({
      actorId: storedToken.physician.id,
      action: 'AUTH_TOKEN_REFRESH',
      entity: 'Physician',
      entityId: storedToken.physician.id,
      ip,
    });

    const tokens = await this.generateTokens(storedToken.physician.id, storedToken.physician.email);
    return tokens;
  }

  private async generateTokens(physicianId: string, email: string) {
    const payload = { sub: physicianId, email, physicianId };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiry,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiry,
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: {
        physicianId,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async logout(physicianId: string, refreshToken?: string, ip?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken
        .updateMany({
          where: { tokenHash, physicianId, revoked: false },
          data: { revoked: true },
        })
        .catch(() => undefined);
    }

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_LOGOUT',
      entity: 'Physician',
      entityId: physicianId,
      ip,
    });
  }

  async getMe(physicianId: string) {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: {
        id: true,
        email: true,
        crmUf: true,
        crmNumber: true,
        name: true,
        crmVerified: true,
        mfaEnabled: true,
        subscriptionStatus: true,
        createdAt: true,
      },
    });

    if (!physician) {
      throw new UnauthorizedException('Physician not found');
    }

    return physician;
  }

  private async runCrmAutoVerification(
    physicianId: string,
    crmUf: string,
    crmNumber: string,
  ): Promise<void> {
    const result = await this.crmChecker.check(crmUf, crmNumber);

    if (result.source === 'unavailable') {
      // CRM_VERIFICATION_URL not configured — skip auto-verification silently.
      // Admin can trigger manual verification via POST /crm-verification/request.
      this.logger.debug(
        `CRM_VERIFICATION_URL not configured — skipping auto-verification for physician ${physicianId}`,
      );
      return;
    }

    if (result.valid) {
      const request = await this.prisma.crmVerificationRequest.create({
        data: { physicianId },
      });
      await this.crmVerification.approve(
        request.id,
        'system-auto',
        `Auto-verified via ${result.source}`,
      );
    } else {
      const request = await this.prisma.crmVerificationRequest.create({
        data: { physicianId },
      });
      await this.crmVerification.reject(
        request.id,
        'system-auto',
        `Auto-check returned invalid: ${result.raw ?? 'no details'}`,
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashLoginIdentifier(identifier: string): string {
    return createHash('sha256').update(identifier).digest('hex');
  }

  private async recordFailedLogin(
    identifierHash: string,
    physicianId: string | null,
    securityState: {
      failedCount: number;
      lastFailedAt: Date | null;
    } | null,
  ): Promise<void> {
    const now = new Date();
    const previousFailedAt = securityState?.lastFailedAt;
    const withinWindow =
      previousFailedAt !== null &&
      previousFailedAt !== undefined &&
      now.getTime() - previousFailedAt.getTime() <= this.loginLockoutWindowMs;
    const failedCount = withinWindow ? (securityState?.failedCount ?? 0) + 1 : 1;
    const lockedUntil =
      failedCount >= this.loginLockoutMaxAttempts
        ? new Date(now.getTime() + this.loginLockoutDurationMs)
        : null;

    await this.prisma.loginSecurityState.upsert({
      where: { identifierHash },
      create: {
        identifierHash,
        physicianId,
        failedCount,
        lockedUntil,
        lastFailedAt: now,
      },
      update: {
        physicianId,
        failedCount,
        lockedUntil,
        lastFailedAt: now,
      },
    });
  }

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string | number>(key, fallback));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  async changePassword(physicianId: string, currentPassword: string, newPassword: string) {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { id: true, passwordHash: true },
    });

    if (!physician) throw new UnauthorizedException('Physician not found');

    const valid = await bcrypt.compare(currentPassword, physician.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.physician.update({
      where: { id: physicianId },
      data: { passwordHash: newHash },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'PASSWORD_CHANGED',
      entity: 'Physician',
      entityId: physicianId,
    });
  }

  async listSessions(physicianId: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        physicianId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return tokens.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      current: false,
    }));
  }

  async revokeSession(physicianId: string, tokenId: string) {
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: tokenId, physicianId },
    });

    if (!token) throw new NotFoundException('Session not found');

    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revoked: true },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'SESSION_REVOKED',
      entity: 'RefreshToken',
      entityId: tokenId,
    });
  }

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch(() => undefined);
  }

  async updateProfile(physicianId: string, data: { name?: string }) {
    const physician = await this.prisma.physician.update({
      where: { id: physicianId },
      data: { name: data.name },
      select: {
        id: true,
        email: true,
        crmUf: true,
        crmNumber: true,
        name: true,
        crmVerified: true,
      },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'PROFILE_UPDATED',
      entity: 'Physician',
      entityId: physicianId,
      payload: { fields: Object.keys(data) },
    });

    return physician;
  }
}
