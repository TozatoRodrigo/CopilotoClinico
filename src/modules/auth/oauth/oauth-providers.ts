import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { OAuthProviderId } from '../../../shared/contracts/oauth';

/**
 * CC-334 — os dois provedores OpenID Connect do login social. Endpoints fixos
 * (documentados e estáveis) em vez de discovery: um GET a menos por login e
 * nada que um documento remoto possa trocar.
 */

/** Claims do id_token que o fluxo usa. `passthrough` mantém o resto. */
export const idTokenClaimsSchema = z
  .object({
    iss: z.string().min(1),
    sub: z.string().min(1).max(255),
    aud: z.union([z.string(), z.array(z.string())]),
    exp: z.number(),
    iat: z.number(),
    nonce: z.string().optional(),
    email: z.string().optional(),
    email_verified: z.union([z.boolean(), z.string()]).optional(),
    name: z.string().optional(),
    // Microsoft: tenant do usuário e "dono do domínio do e-mail verificado".
    tid: z.string().optional(),
    xms_edov: z.union([z.boolean(), z.string(), z.number()]).optional(),
  })
  .passthrough();

export type IdTokenClaims = z.infer<typeof idTokenClaimsSchema>;

export interface OAuthProviderDefinition {
  id: OAuthProviderId;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  /** Parâmetros extras da URL de autorização. */
  authorizationParams: Record<string, string>;
  isValidIssuer(claims: IdTokenClaims): boolean;
  /**
   * E-mail que o provedor garante pertencer a quem entrou, normalizado, ou
   * null. Só ele serve para criar conta ou propor vínculo.
   */
  verifiedEmail(claims: IdTokenClaims): string | null;
}

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Tenant fixo das contas pessoais da Microsoft (outlook.com, hotmail.com…). */
export const MICROSOFT_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTrueClaim(value: boolean | string | number | undefined): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeEmail(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes('@') && normalized.length <= 255 ? normalized : null;
}

const google: OAuthProviderDefinition = {
  id: 'google',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  authorizationParams: { prompt: 'select_account' },
  isValidIssuer: (claims) => GOOGLE_ISSUERS.has(claims.iss),
  verifiedEmail: (claims) =>
    isTrueClaim(claims.email_verified) ? normalizeEmail(claims.email) : null,
};

/**
 * Endpoint `common`: contas pessoais e corporativas. O `iss` muda por tenant
 * (`https://login.microsoftonline.com/{tid}/v2.0`), então ele é conferido
 * contra o `tid` do próprio token — a assinatura já garante que os dois vieram
 * da Microsoft.
 *
 * E-mail: o administrador de um tenant corporativo pode pôr qualquer e-mail
 * num usuário ("nOAuth"), então em conta corporativa o e-mail só vale com o
 * claim opcional `xms_edov` (o dono do domínio foi verificado). Conta pessoal
 * só existe com e-mail confirmado pela própria Microsoft.
 */
const microsoft: OAuthProviderDefinition = {
  id: 'microsoft',
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  authorizationParams: { prompt: 'select_account', response_mode: 'query' },
  isValidIssuer: (claims) =>
    typeof claims.tid === 'string' &&
    GUID_PATTERN.test(claims.tid) &&
    claims.iss === `https://login.microsoftonline.com/${claims.tid}/v2.0`,
  verifiedEmail: (claims) => {
    const verified =
      claims.tid?.toLowerCase() === MICROSOFT_CONSUMER_TENANT_ID || isTrueClaim(claims.xms_edov);
    return verified ? normalizeEmail(claims.email) : null;
  },
};

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderDefinition> = {
  google,
  microsoft,
};

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  /** URL de callback registrada no provedor. */
  redirectUri: string;
  /** Página do web que recebe o desfecho (`/login/oauth`). */
  landingUrl: string;
}

const ENV_PREFIX: Record<OAuthProviderId, string> = {
  google: 'OAUTH_GOOGLE',
  microsoft: 'OAUTH_MICROSOFT',
};

function readSetting(config: ConfigService, key: string): string | null {
  const value = config.get<string>(key)?.trim();
  return value ? value : null;
}

function readBaseUrl(config: ConfigService, key: string): string | null {
  const raw = readSetting(config, key);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Cliente do provedor, lido a cada chamada (liga/desliga sem rebuild). Null
 * desliga o provedor: sem ID e segredo, ou sem `APP_PUBLIC_URL` para montar
 * o callback e a volta ao web. `OAUTH_REDIRECT_BASE_URL` só é preciso quando
 * a API não está em `${APP_PUBLIC_URL}/${API_PREFIX}` (dev: portas
 * diferentes).
 */
export function readOAuthClient(
  config: ConfigService,
  provider: OAuthProviderId,
): OAuthClientConfig | null {
  const clientId = readSetting(config, `${ENV_PREFIX[provider]}_CLIENT_ID`);
  const clientSecret = readSetting(config, `${ENV_PREFIX[provider]}_CLIENT_SECRET`);
  const webUrl = readBaseUrl(config, 'APP_PUBLIC_URL');
  if (!clientId || !clientSecret || !webUrl) return null;

  const apiPrefix = (readSetting(config, 'API_PREFIX') ?? 'v1').replace(/^\/+|\/+$/g, '');
  const apiUrl = readBaseUrl(config, 'OAUTH_REDIRECT_BASE_URL') ?? `${webUrl}/${apiPrefix}`;

  return {
    clientId,
    clientSecret,
    redirectUri: `${apiUrl}/auth/oauth/${provider}/callback`,
    landingUrl: `${webUrl}/login/oauth`,
  };
}

/** Só o web: usado para devolver o navegador mesmo com o provedor desligado. */
export function readOAuthLandingUrl(config: ConfigService): string {
  const webUrl = readBaseUrl(config, 'APP_PUBLIC_URL');
  return webUrl ? `${webUrl}/login/oauth` : '/login/oauth';
}
