import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { extractIp, setAuthCookies, type RequestWithIp } from '../auth-cookies';
import { OAuthService, OAUTH_FLOW_TTL_SECONDS, OAUTH_PENDING_TTL_SECONDS } from './oauth.service';
import {
  oauthCallbackQuerySchema,
  oauthLinkSchema,
  oauthProviderSchema,
  oauthSignupSchema,
  type OAuthLinkInput,
  type OAuthSignupInput,
} from './oauth.schemas';
import type {
  OAuthCallbackStatus,
  OAuthErrorReason,
  OAuthLinkResponse,
  OAuthPendingResponse,
  OAuthProviderId,
  OAuthProvidersResponse,
} from '../../../shared/contracts/oauth';
import type { Physician } from '../../../shared/contracts/clinical';

const FLOW_COOKIE = 'oauth_flow';
const PENDING_COOKIE = 'oauth_pending';

type CookieRequest = FastifyRequest & RequestWithIp & { cookies?: Record<string, string> };

function parseProvider(raw: string): OAuthProviderId {
  const parsed = oauthProviderSchema.safeParse(raw);
  if (!parsed.success) throw new NotFoundException();
  return parsed.data;
}

/**
 * CC-334 — rotas do login com Google/Microsoft. `start` e `callback` são
 * navegações do navegador (redirecionamentos, nunca JSON); o resto é
 * chamado pela página /login/oauth do web.
 *
 * Cookies do fluxo: httpOnly, `SameSite=Lax` (o callback chega numa
 * navegação vinda do provedor, que não leva cookie `Strict`) e restritos ao
 * caminho `/<prefixo>/auth/oauth`.
 */
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    @Inject(OAuthService) private readonly oauthService: OAuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get('providers')
  providers(): OAuthProvidersResponse {
    return { providers: this.oauthService.enabledProviders() };
  }

  @Get(':provider/start')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async start(@Param('provider') rawProvider: string, @Res() res: FastifyReply) {
    const provider = parseProvider(rawProvider);
    const started = await this.oauthService.start(provider);
    if (!started) {
      return this.redirectToLanding(res, { status: 'error', reason: 'unavailable' });
    }

    this.clearOAuthCookie(res, PENDING_COOKIE);
    res.setCookie(FLOW_COOKIE, started.flowToken, {
      ...this.oauthCookieOptions(),
      maxAge: OAUTH_FLOW_TTL_SECONDS,
    });
    res.header('cache-control', 'no-store');
    return res.redirect(started.authorizationUrl, HttpStatus.FOUND);
  }

  @Get(':provider/callback')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async callback(
    @Param('provider') rawProvider: string,
    @Query() rawQuery: unknown,
    @Req() req: CookieRequest,
    @Res() res: FastifyReply,
  ) {
    const provider = parseProvider(rawProvider);
    // O cookie do fluxo vale uma vez só, dê certo ou não.
    const flowToken = req.cookies?.[FLOW_COOKIE];
    this.clearOAuthCookie(res, FLOW_COOKIE);

    const query = oauthCallbackQuerySchema.safeParse(rawQuery);
    const outcome = query.success
      ? await this.oauthService.handleCallback(provider, query.data, flowToken, extractIp(req))
      : ({ status: 'error', reason: 'provider_error' } as const);

    switch (outcome.status) {
      case 'ok':
        setAuthCookies(res, outcome.accessToken, outcome.refreshToken);
        return this.redirectToLanding(res, { status: 'ok' });
      case 'mfa':
      case 'signup':
      case 'link':
        res.setCookie(PENDING_COOKIE, outcome.pendingToken, {
          ...this.oauthCookieOptions(),
          maxAge: OAUTH_PENDING_TTL_SECONDS,
        });
        return this.redirectToLanding(res, { status: outcome.status });
      case 'error':
        return this.redirectToLanding(res, { status: 'error', reason: outcome.reason });
    }
  }

  @Get('pending')
  async pending(@Req() req: CookieRequest): Promise<OAuthPendingResponse> {
    return this.oauthService.readPending(req.cookies?.[PENDING_COOKIE]);
  }

  @Post('signup')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  async signup(
    @Body(new ZodValidationPipe(oauthSignupSchema)) body: OAuthSignupInput,
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<{ physician: Physician }> {
    const result = await this.oauthService.completeSignup(
      req.cookies?.[PENDING_COOKIE],
      body,
      extractIp(req),
    );
    this.clearOAuthCookie(res, PENDING_COOKIE);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { physician: result.physician };
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  async link(
    @Body(new ZodValidationPipe(oauthLinkSchema)) body: OAuthLinkInput,
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<OAuthLinkResponse> {
    const result = await this.oauthService.confirmLink(
      req.cookies?.[PENDING_COOKIE],
      body.password,
      extractIp(req),
    );
    // Senha certa: o vínculo agora vive no token de MFA (ou já foi gravado).
    this.clearOAuthCookie(res, PENDING_COOKIE);
    if (result.mfaRequired) return { mfaRequired: true, mfaToken: result.mfaToken };
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { mfaRequired: false, physician: result.physician };
  }

  private oauthCookiePath(): string {
    const prefix = (this.config.get<string>('API_PREFIX') ?? 'v1').replace(/^\/+|\/+$/g, '');
    return prefix ? `/${prefix}/auth/oauth` : '/auth/oauth';
  }

  private oauthCookieOptions() {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: this.oauthCookiePath(),
    };
  }

  private clearOAuthCookie(res: FastifyReply, name: string) {
    res.clearCookie(name, { path: this.oauthCookiePath() });
  }

  /** Volta ao web com o desfecho na query — nunca token nem dado pessoal. */
  private redirectToLanding(
    res: FastifyReply,
    params: { status: OAuthCallbackStatus; reason?: OAuthErrorReason },
  ) {
    const query = new URLSearchParams({ status: params.status });
    if (params.reason) query.set('reason', params.reason);
    res.header('cache-control', 'no-store');
    return res.redirect(`${this.oauthService.landingUrl()}?${query.toString()}`, HttpStatus.FOUND);
  }
}
