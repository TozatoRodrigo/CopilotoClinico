import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes } from 'crypto';
import { z } from 'zod';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService, type SignInResult } from '../auth.service';
import { ExternalIdentityService } from './external-identity.service';
import { IdTokenError, IdTokenVerifier, safeEqual } from './id-token-verifier';
import { OAUTH_FETCH, OAUTH_HTTP_TIMEOUT_MS, type OAuthFetch } from './oauth-http';
import {
  OAUTH_PROVIDERS,
  readOAuthClient,
  readOAuthLandingUrl,
  type IdTokenClaims,
  type OAuthClientConfig,
  type OAuthProviderDefinition,
} from './oauth-providers';
import type { OAuthCallbackQuery, OAuthSignupInput } from './oauth.schemas';
import {
  oauthProviderValues,
  type OAuthErrorReason,
  type OAuthPendingResponse,
  type OAuthProviderId,
} from '../../../shared/contracts/oauth';

const FLOW_SCOPE = 'oauth_flow' as const;
const PENDING_SCOPE = 'oauth_pending' as const;
/** Tempo para o usuário passar pela tela do provedor. */
export const OAUTH_FLOW_TTL_SECONDS = 10 * 60;
/** Tempo para concluir o passo seguinte (CRM, senha ou código MFA). */
export const OAUTH_PENDING_TTL_SECONDS = 15 * 60;

const providerSchema = z.enum(oauthProviderValues);

/** Cookie do fluxo: liga o callback ao navegador que começou o login. */
const flowClaimsSchema = z.object({
  scope: z.literal(FLOW_SCOPE),
  provider: providerSchema,
  state: z.string().min(16),
  nonce: z.string().min(16),
  codeVerifier: z.string().min(43).max(128),
});

type FlowClaims = z.infer<typeof flowClaimsSchema>;

/** Cookie do passo pendente depois do callback. */
const pendingClaimsSchema = z.discriminatedUnion('kind', [
  z.object({
    scope: z.literal(PENDING_SCOPE),
    kind: z.literal('mfa'),
    provider: providerSchema,
    mfaToken: z.string().min(1),
  }),
  z.object({
    scope: z.literal(PENDING_SCOPE),
    kind: z.literal('signup'),
    provider: providerSchema,
    subject: z.string().min(1),
    email: z.string().min(3),
    name: z.string().nullable(),
  }),
  z.object({
    scope: z.literal(PENDING_SCOPE),
    kind: z.literal('link'),
    provider: providerSchema,
    subject: z.string().min(1),
    email: z.string().min(3),
    physicianId: z.string().min(1),
  }),
]);

type PendingClaims = z.infer<typeof pendingClaimsSchema>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type PendingStep = DistributiveOmit<PendingClaims, 'scope'>;

const tokenResponseSchema = z.object({ id_token: z.string().min(1) });

export type OAuthCallbackOutcome =
  | { status: 'ok'; accessToken: string; refreshToken: string }
  | { status: 'mfa' | 'signup' | 'link'; pendingToken: string }
  | { status: 'error'; reason: OAuthErrorReason };

/** Falha do lado do provedor (troca do código). `detail` vai para o log. */
class OAuthProviderError extends Error {
  constructor(readonly detail: string) {
    super(`provedor OAuth: ${detail}`);
  }
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * CC-334 — login com Google ou Microsoft (OAuth 2.0 + OpenID Connect, código
 * de autorização com PKCE, `state` e `nonce`). Tudo no backend: o segredo do
 * cliente e o code_verifier nunca chegam ao navegador.
 *
 * Desfechos do callback:
 * - conta externa já vinculada → a mesma sessão do login por senha (MFA,
 *   se ligado, continua exigido);
 * - e-mail verificado sem cadastro → conta nova, com CRM obrigatório
 *   (`POST /auth/oauth/signup`);
 * - e-mail verificado de um cadastro existente → vínculo só depois da senha
 *   (`POST /auth/oauth/link`), nunca automático;
 * - e-mail não verificado pelo provedor → recusa.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly flowSecret: string;
  private readonly pendingSecret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ExternalIdentityService)
    private readonly externalIdentities: ExternalIdentityService,
    @Inject(IdTokenVerifier) private readonly idTokenVerifier: IdTokenVerifier,
    @Inject(OAUTH_FETCH) private readonly fetchImpl: OAuthFetch,
  ) {
    // Segredos próprios, derivados do access secret como o de MFA pendente
    // (SEC-01): nenhum destes tokens é aceito como sessão pelo JwtStrategy.
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.flowSecret = createHmac('sha256', accessSecret).update('oauth_flow_token').digest('hex');
    this.pendingSecret = createHmac('sha256', accessSecret)
      .update('oauth_pending_token')
      .digest('hex');
  }

  /** Provedores com cliente configurado agora (lido a cada chamada). */
  enabledProviders(): OAuthProviderId[] {
    return oauthProviderValues.filter((provider) => readOAuthClient(this.config, provider));
  }

  landingUrl(): string {
    return readOAuthLandingUrl(this.config);
  }

  /** URL de autorização do provedor e o token do cookie do fluxo; null = desligado. */
  async start(
    provider: OAuthProviderId,
  ): Promise<{ authorizationUrl: string; flowToken: string } | null> {
    const client = readOAuthClient(this.config, provider);
    if (!client) return null;
    const definition = OAUTH_PROVIDERS[provider];

    const state = base64url(randomBytes(32));
    const nonce = base64url(randomBytes(32));
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

    const url = new URL(definition.authorizationEndpoint);
    const params: Record<string, string> = {
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...definition.authorizationParams,
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const flowToken = await this.jwt.signAsync(
      { scope: FLOW_SCOPE, provider, state, nonce, codeVerifier } satisfies FlowClaims,
      { secret: this.flowSecret, expiresIn: OAUTH_FLOW_TTL_SECONDS },
    );
    return { authorizationUrl: url.toString(), flowToken };
  }

  async handleCallback(
    provider: OAuthProviderId,
    query: OAuthCallbackQuery,
    flowToken: string | undefined,
    ip?: string,
  ): Promise<OAuthCallbackOutcome> {
    const client = readOAuthClient(this.config, provider);
    if (!client) return { status: 'error', reason: 'unavailable' };
    const definition = OAUTH_PROVIDERS[provider];

    if (query.error) {
      // access_denied = o usuário desistiu; o resto é erro do provedor.
      const reason: OAuthErrorReason =
        query.error === 'access_denied' ? 'cancelled' : 'provider_error';
      this.logger.warn(`OAUTH_CALLBACK_FAILED provider=${provider} reason=${reason}`);
      if (reason !== 'cancelled') await this.auditFailure(provider, reason, ip);
      return { status: 'error', reason };
    }

    const flow = await this.readFlow(flowToken);
    if (
      !flow ||
      flow.provider !== provider ||
      !query.state ||
      !safeEqual(flow.state, query.state)
    ) {
      return this.fail(provider, 'state_mismatch', flow ? 'state' : 'no_flow_cookie', ip);
    }
    if (!query.code) return this.fail(provider, 'provider_error', 'no_code', ip);

    let idToken: string;
    try {
      idToken = await this.exchangeCode(definition, client, query.code, flow.codeVerifier);
    } catch (err) {
      const detail = err instanceof OAuthProviderError ? err.detail : 'token_request';
      return this.fail(provider, 'provider_error', detail, ip);
    }

    let claims: IdTokenClaims;
    try {
      claims = await this.idTokenVerifier.verify(definition, idToken, {
        clientId: client.clientId,
        nonce: flow.nonce,
      });
    } catch (err) {
      if (err instanceof IdTokenError && err.failure === 'jwks_unavailable') {
        return this.fail(provider, 'provider_error', err.failure, ip);
      }
      const detail = err instanceof IdTokenError ? err.failure : 'unexpected';
      return this.fail(provider, 'invalid_token', detail, ip);
    }

    // 1. Conta externa já vinculada: entra (o e-mail atual não importa).
    const linked = await this.externalIdentities.signInBySubject(provider, claims.sub);
    if (linked) {
      const result = await this.authService.signInWithExternalIdentity(linked, provider, ip);
      if (result.mfaRequired) {
        return {
          status: 'mfa',
          pendingToken: await this.signPending({
            kind: 'mfa',
            provider,
            mfaToken: result.mfaToken,
          }),
        };
      }
      return {
        status: 'ok',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    }

    // 2. Sem vínculo: só um e-mail garantido pelo provedor cria ou vincula.
    const email = definition.verifiedEmail(claims);
    if (!email) return this.fail(provider, 'email_unverified', 'email_not_verified', ip);

    const existing = await this.prisma.physician.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return {
        status: 'link',
        pendingToken: await this.signPending({
          kind: 'link',
          provider,
          subject: claims.sub,
          email,
          physicianId: existing.id,
        }),
      };
    }

    const name = claims.name?.trim().slice(0, 255) || null;
    return {
      status: 'signup',
      pendingToken: await this.signPending({
        kind: 'signup',
        provider,
        subject: claims.sub,
        email,
        name,
      }),
    };
  }

  /** O passo pendente, sem `sub` nem id de médico (o web só precisa exibir). */
  async readPending(pendingToken: string | undefined): Promise<OAuthPendingResponse> {
    const pending = await this.readPendingClaims(pendingToken);
    if (!pending) return { kind: 'none' };
    switch (pending.kind) {
      case 'mfa':
        return { kind: 'mfa', provider: pending.provider, mfaToken: pending.mfaToken };
      case 'signup':
        return {
          kind: 'signup',
          provider: pending.provider,
          email: pending.email,
          name: pending.name,
        };
      case 'link':
        return { kind: 'link', provider: pending.provider, email: pending.email };
    }
  }

  /** Conta nova: o CRM chega aqui; sem ele não existe cadastro. */
  async completeSignup(
    pendingToken: string | undefined,
    input: OAuthSignupInput,
    ip?: string,
  ): Promise<SignInResult & { mfaRequired: false }> {
    const pending = await this.readPendingClaims(pendingToken);
    if (pending?.kind !== 'signup') {
      throw new UnauthorizedException('O login com o provedor expirou. Entre de novo.');
    }
    return this.authService.registerWithExternalIdentity(
      {
        email: pending.email,
        name: input.name?.trim() || pending.name,
        crmUf: input.crmUf,
        crmNumber: input.crmNumber,
        provider: pending.provider,
        subject: pending.subject,
      },
      ip,
    );
  }

  /** Cadastro existente com o mesmo e-mail: a senha confirma o vínculo. */
  async confirmLink(
    pendingToken: string | undefined,
    password: string,
    ip?: string,
  ): Promise<SignInResult> {
    const pending = await this.readPendingClaims(pendingToken);
    if (pending?.kind !== 'link') {
      throw new UnauthorizedException('O login com o provedor expirou. Entre de novo.');
    }
    return this.authService.linkExternalIdentityWithPassword(
      pending.physicianId,
      password,
      { provider: pending.provider, subject: pending.subject, email: pending.email },
      ip,
    );
  }

  private async exchangeCode(
    definition: OAuthProviderDefinition,
    client: OAuthClientConfig,
    code: string,
    codeVerifier: string,
  ): Promise<string> {
    const response = await this.fetchImpl(definition.tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: client.redirectUri,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code_verifier: codeVerifier,
      }).toString(),
      signal: AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new OAuthProviderError(`token_http_${response.status}`);
    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new OAuthProviderError('token_response');
    return parsed.data.id_token;
  }

  private async readFlow(token: string | undefined): Promise<FlowClaims | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<object>(token, { secret: this.flowSecret });
      const parsed = flowClaimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async signPending(step: PendingStep): Promise<string> {
    return this.jwt.signAsync(
      { ...step, scope: PENDING_SCOPE },
      { secret: this.pendingSecret, expiresIn: OAUTH_PENDING_TTL_SECONDS },
    );
  }

  private async readPendingClaims(token: string | undefined): Promise<PendingClaims | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<object>(token, { secret: this.pendingSecret });
      const parsed = pendingClaimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Recusa com log e trilha. `detail` explica a causa técnica (ex.: `aud`,
   * `nonce`, `token_http_400`) sem nenhum dado do usuário ou do token.
   */
  private async fail(
    provider: OAuthProviderId,
    reason: OAuthErrorReason,
    detail: string,
    ip?: string,
  ): Promise<OAuthCallbackOutcome> {
    this.logger.warn(
      `OAUTH_CALLBACK_FAILED provider=${provider} reason=${reason} detail=${detail}`,
    );
    await this.auditFailure(provider, reason, ip);
    return { status: 'error', reason };
  }

  private async auditFailure(
    provider: OAuthProviderId,
    reason: OAuthErrorReason,
    ip?: string,
  ): Promise<void> {
    await this.auditService
      .log({
        actorId: 'unknown',
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: 'unknown',
        payload: { reason, method: 'oauth', provider },
        ip,
      })
      .catch(() => undefined);
  }
}
