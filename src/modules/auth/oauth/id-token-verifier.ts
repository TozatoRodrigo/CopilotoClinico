import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { OAUTH_FETCH, OAUTH_HTTP_TIMEOUT_MS, type OAuthFetch } from './oauth-http';
import {
  idTokenClaimsSchema,
  type IdTokenClaims,
  type OAuthProviderDefinition,
} from './oauth-providers';

/** Quanto tempo a lista de chaves do provedor vale sem rebuscar. */
export const JWKS_TTL_MS = 60 * 60 * 1000;
/**
 * Intervalo mínimo entre duas buscas do JWKS. Um `kid` desconhecido faz
 * rebuscar (o provedor girou a chave), mas um token com `kid` inventado não
 * pode virar um GET ao provedor por requisição.
 */
export const JWKS_REFETCH_COOLDOWN_MS = 30 * 1000;
/** Folga de relógio aceita em `exp`/`nbf`. */
const CLOCK_TOLERANCE_SECONDS = 60;

export type IdTokenFailure =
  | 'malformed'
  | 'unknown_key'
  | 'jwks_unavailable'
  | 'signature'
  | 'expired'
  | 'audience'
  | 'claims'
  | 'issuer'
  | 'nonce';

/** Falha na validação do id_token. `failure` vai para o log, nunca o token. */
export class IdTokenError extends Error {
  constructor(readonly failure: IdTokenFailure) {
    super(`id_token inválido: ${failure}`);
    this.name = 'IdTokenError';
  }
}

const headerSchema = z.object({ alg: z.string(), kid: z.string().min(1) });

const jwksSchema = z.object({
  keys: z.array(
    z
      .object({
        kid: z.string().optional(),
        kty: z.string(),
        use: z.string().optional(),
        n: z.string().optional(),
        e: z.string().optional(),
      })
      .passthrough(),
  ),
});

interface JwksEntry {
  /** kid → chave pública em PEM. */
  keys: Map<string, string>;
  fetchedAt: number;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Traduz o erro do jsonwebtoken sem carregar a mensagem (que pode citar claims). */
function classifyVerifyError(err: unknown): IdTokenFailure {
  if (!(err instanceof Error)) return 'malformed';
  if (err.name === 'TokenExpiredError') return 'expired';
  if (err.name === 'NotBeforeError') return 'claims';
  if (err.message.startsWith('jwt audience invalid')) return 'audience';
  if (err.message === 'invalid signature') return 'signature';
  return 'malformed';
}

/**
 * CC-334 — valida o id_token do provedor: assinatura RS256 com a chave do
 * JWKS (pelo `kid`), `aud` = nosso client_id, `exp`, `iss` (regra de cada
 * provedor) e `nonce` (o do fluxo, guardado no cookie). O jsonwebtoken (já no
 * projeto via @nestjs/jwt) confere assinatura, `aud` e `exp`; o JWK vira PEM
 * com `crypto.createPublicKey`.
 */
@Injectable()
export class IdTokenVerifier {
  private readonly logger = new Logger(IdTokenVerifier.name);
  private readonly jwks = new Map<string, JwksEntry>();
  private readonly loading = new Map<string, Promise<Map<string, string>>>();

  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(OAUTH_FETCH) private readonly fetchImpl: OAuthFetch,
  ) {}

  async verify(
    provider: OAuthProviderDefinition,
    idToken: string,
    expected: { clientId: string; nonce: string },
  ): Promise<IdTokenClaims> {
    const decoded: unknown = this.jwt.decode(idToken, { complete: true });
    const header = headerSchema.safeParse(
      decoded && typeof decoded === 'object' ? (decoded as { header?: unknown }).header : undefined,
    );
    // Só RS256: é o que Google e Microsoft usam, e fechar a lista impede
    // trocar o algoritmo no cabeçalho (ex.: HS256 com a chave pública).
    if (!header.success || header.data.alg !== 'RS256') throw new IdTokenError('malformed');

    const publicKey = await this.publicKey(provider.jwksUri, header.data.kid);

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<object>(idToken, {
        publicKey,
        algorithms: ['RS256'],
        audience: expected.clientId,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
    } catch (err) {
      throw new IdTokenError(classifyVerifyError(err));
    }

    // exp/iat obrigatórios: o jsonwebtoken só confere `exp` quando ele existe.
    const claims = idTokenClaimsSchema.safeParse(payload);
    if (!claims.success) throw new IdTokenError('claims');
    if (!provider.isValidIssuer(claims.data)) throw new IdTokenError('issuer');
    if (!claims.data.nonce || !safeEqual(claims.data.nonce, expected.nonce)) {
      throw new IdTokenError('nonce');
    }
    return claims.data;
  }

  private async publicKey(jwksUri: string, kid: string): Promise<string> {
    const entry = this.jwks.get(jwksUri);
    const age = entry ? Date.now() - entry.fetchedAt : Number.POSITIVE_INFINITY;
    const cached = entry?.keys.get(kid);
    if (cached && age < JWKS_TTL_MS) return cached;
    if (entry && age < JWKS_REFETCH_COOLDOWN_MS) throw new IdTokenError('unknown_key');

    let keys: Map<string, string>;
    try {
      keys = await this.loadOnce(jwksUri);
    } catch (err) {
      this.logger.warn(
        `OAUTH_JWKS_FETCH_FAILED uri=${jwksUri} error=${err instanceof Error ? err.message : 'unknown'}`,
      );
      // Rede fora: a última lista boa ainda vale para a chave que já se conhecia.
      if (cached) return cached;
      throw new IdTokenError('jwks_unavailable');
    }
    const key = keys.get(kid);
    if (!key) throw new IdTokenError('unknown_key');
    return key;
  }

  /** Uma busca por vez por JWKS: logins simultâneos esperam a mesma resposta. */
  private loadOnce(jwksUri: string): Promise<Map<string, string>> {
    const inFlight = this.loading.get(jwksUri);
    if (inFlight) return inFlight;
    const load = this.load(jwksUri).finally(() => this.loading.delete(jwksUri));
    this.loading.set(jwksUri, load);
    return load;
  }

  private async load(jwksUri: string): Promise<Map<string, string>> {
    const response = await this.fetchImpl(jwksUri, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = jwksSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('JWKS fora do formato');

    const keys = new Map<string, string>();
    for (const jwk of parsed.data.keys) {
      if (!jwk.kid || jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig') || !jwk.n || !jwk.e) {
        continue;
      }
      try {
        const pem = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' })
          .export({ type: 'spki', format: 'pem' })
          .toString();
        keys.set(jwk.kid, pem);
      } catch {
        // Chave malformada no JWKS: ignora só ela.
      }
    }
    this.jwks.set(jwksUri, { keys, fetchedAt: Date.now() });
    return keys;
  }
}
