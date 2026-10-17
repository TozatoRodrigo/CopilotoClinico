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
import { createHash, createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import type { Physician } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../config/prisma.service';
import { AccountLockoutService } from './account-lockout.service';
import { AuditService } from '../audit/audit.service';
import {
  RegisterInput,
  LoginInput,
  RefreshInput,
  UpdateProfileInput,
} from './schemas/auth.schemas';
import { MfaService } from './mfa.service';
import { BetaInviteService } from '../beta/beta-invite.service';
import { CrmVerificationService } from '../physicians/crm-verification.service';
import { CrmCheckerService } from '../physicians/crm-checker.service';
import {
  ExternalIdentityService,
  type ExternalIdentityClaim,
} from './oauth/external-identity.service';
import { oauthProviderValues, type OAuthProviderId } from '../../shared/contracts/oauth';

const MFA_PENDING_SCOPE = 'mfa_pending' as const;
const MFA_TOKEN_EXPIRY = '5m';

/**
 * Claims do token de "MFA pendente". CC-334: no login social ele leva o
 * provedor (para a trilha) e, quando o login também vincula uma conta
 * externa, o vínculo — que só é gravado depois do 2º fator.
 */
const mfaPendingClaimsSchema = z.object({
  physicianId: z.string().min(1),
  email: z.string(),
  scope: z.literal(MFA_PENDING_SCOPE),
  provider: z.enum(oauthProviderValues).optional(),
  oauthLink: z
    .object({
      provider: z.enum(oauthProviderValues),
      subject: z.string().min(1),
      email: z.string().min(1),
    })
    .optional(),
});

/** Como a sessão está sendo aberta (CC-334). Vazio = e-mail e senha. */
interface SignInContext {
  provider?: OAuthProviderId;
  /** Conta externa a vincular junto com este login (depois do 2º fator). */
  oauthLink?: ExternalIdentityClaim;
}

/** O médico como a sessão o devolve ao web (sem hash de senha nem segredo de MFA). */
export function toSessionPhysician(
  physician: Pick<
    Physician,
    | 'id'
    | 'email'
    | 'crmUf'
    | 'crmNumber'
    | 'name'
    | 'crmVerified'
    | 'role'
    | 'locale'
    | 'isCardReviewer'
  > & { passwordHash: string | null },
) {
  return {
    id: physician.id,
    email: physician.email,
    crmUf: physician.crmUf,
    crmNumber: physician.crmNumber,
    name: physician.name,
    crmVerified: physician.crmVerified,
    role: physician.role,
    locale: physician.locale,
    hasPassword: physician.passwordHash !== null,
    // CC-404 — o web mostra a fila de revisão de cartões só ao revisor.
    isCardReviewer: physician.isCardReviewer,
  };
}

export type SessionPhysician = ReturnType<typeof toSessionPhysician>;

export type SignInResult =
  | { mfaRequired: true; mfaToken: string }
  | {
      mfaRequired: false;
      physician: SessionPhysician;
      accessToken: string;
      refreshToken: string;
    };

/** Cadastro vindo do login social: o e-mail é o que o provedor garantiu. */
export interface ExternalRegistrationInput {
  email: string;
  name: string | null;
  crmUf: string;
  crmNumber: string;
  provider: OAuthProviderId;
  subject: string;
}

type JwtExpiry = NonNullable<JwtSignOptions['expiresIn']>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly mfaPendingSecret: string;
  private readonly accessExpiry: JwtExpiry;
  private readonly refreshExpiry: JwtExpiry;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AccountLockoutService) private readonly lockout: AccountLockoutService,
    @Inject(MfaService) private readonly mfaService: MfaService,
    @Inject(BetaInviteService) private readonly betaInvites: BetaInviteService,
    @Inject(CrmVerificationService) private readonly crmVerification: CrmVerificationService,
    @Inject(CrmCheckerService) private readonly crmChecker: CrmCheckerService,
    @Inject(ExternalIdentityService)
    private readonly externalIdentities: ExternalIdentityService,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    // SEC-01 — segredo dedicado para o token de "MFA pendente", derivado do
    // access secret (não exige nova env var). Antes este token era assinado
    // com accessSecret e só tinha o claim `scope` distinguindo-o de um
    // access token normal — como nada além de verifyMfaLogin() checava esse
    // claim, ele era aceito como sessão completa por qualquer endpoint
    // protegido só por JwtAuthGuard, pulando o 2º fator inteiramente. Usar
    // um segredo diferente garante que JwtStrategy (que verifica contra
    // accessSecret) rejeite esse token mesmo que a checagem de `scope` seja
    // removida/alterada no futuro — ver também jwt.strategy.ts.
    this.mfaPendingSecret = createHmac('sha256', this.accessSecret)
      .update('mfa_pending_token')
      .digest('hex');
    this.accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY', '15m') as unknown as JwtExpiry;
    this.refreshExpiry = this.config.get<string>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    ) as unknown as JwtExpiry;
  }

  async register(input: RegisterInput, ip?: string) {
    const existing = await this.prisma.physician.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // CC-702 — com BETA_INVITE_REQUIRED ligada, só entra quem tem convite
    // válido. Antes do hash da senha: código recusado não custa bcrypt.
    const admission = await this.betaInvites.admit(input.inviteCode);

    const passwordHash = await bcrypt.hash(input.password, 12);

    // A conta e o uso do convite são gravados juntos (ver BetaInviteService).
    const physician = await this.betaInvites.createAccount(
      admission,
      (db) =>
        db.physician.create({
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
            role: true,
            locale: true,
            createdAt: true,
          },
        }),
      ip,
    );

    await this.auditSilently({
      actorId: physician.id,
      action: 'AUTH_REGISTER',
      entity: 'Physician',
      entityId: physician.id,
      // Sem o email: a trilha sobrevive à eliminação LGPD, que anonimiza o
      // email no cadastro. O entityId já identifica o médico.
      payload: { crmUf: physician.crmUf },
      ip,
    });

    this.scheduleCrmAutoVerification(physician.id, physician.crmUf, physician.crmNumber);

    const tokens = await this.generateTokens(physician.id, physician.email, physician.role);
    return { physician, ...tokens };
  }

  /**
   * CC-334 — conta nova pelo login com Google/Microsoft. Mesmo cadastro de
   * register(), com CRM obrigatório, mas sem senha e já com a conta externa
   * vinculada (mesma escrita). Quem chama garante que o e-mail veio
   * verificado pelo provedor.
   */
  async registerWithExternalIdentity(
    input: ExternalRegistrationInput,
    ip?: string,
  ): Promise<SignInResult & { mfaRequired: false }> {
    const existing = await this.prisma.physician.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    let physician: Physician;
    try {
      physician = await this.prisma.physician.create({
        data: {
          email: input.email,
          passwordHash: null,
          crmUf: input.crmUf,
          crmNumber: input.crmNumber,
          name: input.name,
          externalIdentities: {
            create: {
              provider: input.provider,
              subject: input.subject,
              emailAtLink: input.email,
              lastLoginAt: new Date(),
            },
          },
        },
      });
    } catch (err) {
      // Corrida (duas abas concluindo o mesmo cadastro): e-mail ou conta
      // externa já gravados.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    // Sem e-mail no payload (padrão mais restrito da trilha, PR #147).
    await this.auditSilently({
      actorId: physician.id,
      action: 'AUTH_REGISTER',
      entity: 'Physician',
      entityId: physician.id,
      payload: { crmUf: physician.crmUf, method: 'oauth', provider: input.provider },
      ip,
    });

    this.scheduleCrmAutoVerification(physician.id, physician.crmUf, physician.crmNumber);

    const tokens = await this.generateTokens(physician.id, physician.email, physician.role);
    return { mfaRequired: false, physician: toSessionPhysician(physician), ...tokens };
  }

  private scheduleCrmAutoVerification(physicianId: string, crmUf: string, crmNumber: string) {
    setImmediate(() => {
      this.runCrmAutoVerification(physicianId, crmUf, crmNumber).catch((err) =>
        this.logger.error('CRM auto-verification failed', err),
      );
    });
  }

  async login(input: LoginInput, ip?: string) {
    const physician = await this.prisma.physician.findUnique({
      where: { email: input.email },
    });

    // CC-026 — a tentativa é reservada ANTES de conferir a senha, num UPDATE
    // condicional: logins em paralelo não passam do limite. Lendo o contador
    // antes e gravando depois, todos liam o mesmo valor e conferiam a senha.
    // Bloqueada, a conta responde como senha errada (não revela o cadastro).
    if (!(await this.lockout.reserveLoginAttempt(input.email, physician?.id ?? null))) {
      await this.auditSilently({
        actorId: physician?.id ?? 'unknown',
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: physician?.id ?? 'unknown',
        payload: { reason: 'account_locked' },
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!physician) {
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

    // CC-334 — conta criada pelo login social não tem senha: mesma resposta
    // (e mesma contagem para o bloqueio) que uma senha errada.
    const passwordValid =
      physician.passwordHash !== null &&
      (await bcrypt.compare(input.password, physician.passwordHash));
    if (!passwordValid) {
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

    await this.lockout.clearLogin(input.email);

    return this.completeSignIn(physician, ip, {});
  }

  /**
   * CC-334 — login social de um médico já vinculado (o OAuthService validou o
   * id_token e achou o vínculo). Com MFA ligado, o 2º fator continua exigido.
   */
  async signInWithExternalIdentity(
    physician: Physician,
    provider: OAuthProviderId,
    ip?: string,
  ): Promise<SignInResult> {
    return this.completeSignIn(physician, ip, { provider });
  }

  /**
   * CC-334 — conta existente com o mesmo e-mail da conta externa: o médico
   * prova que é o dono com a senha (uma vez) e só então o vínculo é gravado;
   * com MFA ligado, só depois do 2º fator (verifyMfaLogin). A senha passa
   * pelo mesmo bloqueio por tentativas do login.
   */
  async linkExternalIdentityWithPassword(
    physicianId: string,
    password: string,
    claim: ExternalIdentityClaim,
    ip?: string,
  ): Promise<SignInResult> {
    const physician = await this.prisma.physician.findUnique({ where: { id: physicianId } });
    if (!physician) throw new UnauthorizedException('Invalid credentials');

    // CC-026 — a mesma reserva atômica do login, no mesmo contador por e-mail:
    // tentativas em paralelo pelo vínculo não conferem mais senhas que o teto.
    if (!(await this.lockout.reserveLoginAttempt(physician.email, physician.id))) {
      await this.auditLinkFailure(physician.id, claim.provider, 'account_locked', ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid =
      physician.passwordHash !== null && (await bcrypt.compare(password, physician.passwordHash));
    if (!passwordValid) {
      await this.auditLinkFailure(physician.id, claim.provider, 'invalid_password', ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.lockout.clearLogin(physician.email);

    return this.completeSignIn(physician, ip, { provider: claim.provider, oauthLink: claim });
  }

  private async auditLinkFailure(
    physicianId: string,
    provider: OAuthProviderId,
    reason: 'account_locked' | 'invalid_password',
    ip?: string,
  ): Promise<void> {
    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_OAUTH_LINK_FAILED',
      entity: 'Physician',
      entityId: physicianId,
      payload: { provider, reason },
      ip,
    });
  }

  /**
   * Fim comum de todo login com a identidade já provada (senha ou provedor):
   * MFA ligado → token de MFA pendente; senão grava o vínculo pedido (se
   * houver) e abre a sessão.
   */
  private async completeSignIn(
    physician: Physician,
    ip: string | undefined,
    context: SignInContext,
  ): Promise<SignInResult> {
    const method = context.provider ? { method: 'oauth', provider: context.provider } : undefined;

    if (physician.mfaEnabled) {
      const mfaToken = await this.issueMfaPendingToken(physician.id, physician.email, context);
      await this.auditSilently({
        actorId: physician.id,
        action: 'AUTH_LOGIN_MFA_REQUIRED',
        entity: 'Physician',
        entityId: physician.id,
        payload: method,
        ip,
      });
      return { mfaRequired: true, mfaToken };
    }

    if (context.oauthLink) {
      await this.externalIdentities.link(physician.id, context.oauthLink, ip);
    }

    await this.auditSilently({
      actorId: physician.id,
      action: 'AUTH_LOGIN',
      entity: 'Physician',
      entityId: physician.id,
      payload: method,
      ip,
    });

    const tokens = await this.generateTokens(physician.id, physician.email, physician.role);
    return { mfaRequired: false, physician: toSessionPhysician(physician), ...tokens };
  }

  async verifyMfaLogin(mfaToken: string, code: string, ip?: string) {
    let claims: z.infer<typeof mfaPendingClaimsSchema>;

    try {
      const payload = await this.jwt.verifyAsync<object>(mfaToken, {
        secret: this.mfaPendingSecret,
      });
      // Também recusa escopo diferente de mfa_pending.
      claims = mfaPendingClaimsSchema.parse(payload);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    const { physicianId, email } = claims;

    await this.mfaService.verifyMfaCode(physicianId, code, ip);

    // CC-018 — `erasedAt: null`: o token de MFA pendente (5 min) emitido antes
    // da eliminação LGPD não vira sessão depois dela.
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId, erasedAt: null },
      select: {
        id: true,
        email: true,
        crmUf: true,
        crmNumber: true,
        name: true,
        crmVerified: true,
        role: true,
        locale: true,
        isCardReviewer: true,
        passwordHash: true,
      },
    });

    if (!physician) throw new UnauthorizedException('Physician not found');

    // CC-334 — o vínculo pedido no login social só existe depois do 2º fator
    // (e, CC-018, só para quem não foi eliminado).
    if (claims.oauthLink) {
      await this.externalIdentities.link(physicianId, claims.oauthLink, ip);
    }

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_LOGIN',
      entity: 'Physician',
      entityId: physicianId,
      payload: claims.provider
        ? { mfa: true, method: 'oauth', provider: claims.provider }
        : { mfa: true },
      ip,
    });

    const tokens = await this.generateTokens(physicianId, email, physician.role);
    return { mfaRequired: false, physician: toSessionPhysician(physician), ...tokens };
  }

  private async issueMfaPendingToken(
    physicianId: string,
    email: string,
    context: SignInContext = {},
  ): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: physicianId,
        email,
        physicianId,
        scope: MFA_PENDING_SCOPE,
        ...(context.provider ? { provider: context.provider } : {}),
        ...(context.oauthLink ? { oauthLink: context.oauthLink } : {}),
      },
      { secret: this.mfaPendingSecret, expiresIn: MFA_TOKEN_EXPIRY },
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

    // CC-018 — a eliminação apaga os refresh tokens, mas um refresh que leu o
    // token antes dela pode gravar um novo depois. O cadastro já vem no
    // include: checar aqui não custa consulta.
    if (storedToken.physician.erasedAt) {
      this.logger.warn(
        `AUTH_ERASED_PHYSICIAN_TOKEN_REJECTED: physician ${storedToken.physician.id} (refresh)`,
      );
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

    const tokens = await this.generateTokens(
      storedToken.physician.id,
      storedToken.physician.email,
      storedToken.physician.role,
    );
    return tokens;
  }

  private async generateTokens(physicianId: string, email: string, role: string) {
    const payload = { sub: physicianId, email, physicianId, role };

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
        specialty: true,
        crmVerified: true,
        role: true,
        mfaEnabled: true,
        subscriptionStatus: true,
        locale: true,
        isCardReviewer: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    if (!physician) {
      throw new UnauthorizedException('Physician not found');
    }

    const { passwordHash, ...profile } = physician;
    return { ...profile, hasPassword: passwordHash !== null };
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

  async changePassword(physicianId: string, currentPassword: string, newPassword: string) {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { id: true, passwordHash: true },
    });

    if (!physician) throw new UnauthorizedException('Physician not found');
    if (physician.passwordHash === null) {
      throw new BadRequestException('Esta conta entra com Google ou Microsoft e não tem senha');
    }

    // CC-025 — com uma sessão roubada, chutar a senha atual aqui tomaria a
    // conta. A reserva conta a tentativa; só o acerto zera o contador.
    await this.lockout.reserveAttempt('password_change', physicianId);
    const valid = await bcrypt.compare(currentPassword, physician.passwordHash);
    // CC-014 — 400, não 401: o web trata todo 401 como sessão expirada e leva
    // ao login, então errar a senha atual tirava o médico da tela.
    if (!valid) throw new BadRequestException('Senha atual incorreta');

    await this.lockout.clear('password_change', physicianId);
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

  /**
   * Devolve o mesmo perfil de GET /auth/me. O web troca o médico da sessão
   * por esta resposta (aba Perfil): um recorte sem `role` rebaixava o
   * administrador na tela até o próximo login.
   */
  async updateProfile(physicianId: string, data: UpdateProfileInput) {
    await this.prisma.physician.update({
      where: { id: physicianId },
      data: { name: data.name, locale: data.locale, specialty: data.specialty },
      select: { id: true },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'PROFILE_UPDATED',
      entity: 'Physician',
      entityId: physicianId,
      payload: { fields: Object.keys(data) },
    });

    return this.getMe(physicianId);
  }
}
