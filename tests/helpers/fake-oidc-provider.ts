import { generateKeyPairSync, type JsonWebKey } from 'crypto';
import { JwtService } from '@nestjs/jwt';

/**
 * CC-334 — provedor OpenID Connect falso para testes unitários do login
 * social: chaves RSA de verdade, JWKS servido por um `fetch` falso e endpoint
 * de token que devolve o id_token que o teste escolher. Nenhuma rede.
 */
interface SigningKey {
  kid: string;
  privateKeyPem: string;
  publicJwk: JsonWebKey;
}

function generateSigningKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicJwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' },
  };
}

export interface FakeOidcProviderOptions {
  jwksUri: string;
  tokenEndpoint: string;
}

export interface TokenRequest {
  url: string;
  body: URLSearchParams;
}

export function createFakeOidcProvider(options: FakeOidcProviderOptions) {
  const jwt = new JwtService({});
  let keyCounter = 0;
  let published: SigningKey[] = [generateSigningKey(`kid-${++keyCounter}`)];
  // Chave fora do JWKS: assina tokens que precisam falhar na assinatura.
  const outsider = generateSigningKey('kid-outsider');

  let nextIdToken: string | null = null;
  let tokenStatus = 200;
  const tokenRequests: TokenRequest[] = [];
  let jwksRequests = 0;

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === options.jwksUri) {
      jwksRequests++;
      return Response.json({ keys: published.map((key) => key.publicJwk) });
    }
    if (url === options.tokenEndpoint) {
      tokenRequests.push({ url, body: new URLSearchParams(String(init?.body ?? '')) });
      if (tokenStatus !== 200) {
        return Response.json({ error: 'invalid_grant' }, { status: tokenStatus });
      }
      return Response.json({ access_token: 'provider-access-token', id_token: nextIdToken });
    }
    return new Response('not found', { status: 404 });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    get currentKid() {
      return published[published.length - 1]!.kid;
    },
    get jwksRequests() {
      return jwksRequests;
    },
    tokenRequests,

    /** Assina com a chave publicada atual (ou a de fora, para falhar a assinatura). */
    async signIdToken(
      claims: Record<string, unknown>,
      signOptions: { useOutsiderKey?: boolean; kid?: string; expiresInSeconds?: number } = {},
    ): Promise<string> {
      const key = signOptions.useOutsiderKey ? outsider : published[published.length - 1]!;
      return jwt.signAsync(
        { iat: Math.floor(Date.now() / 1000), ...claims },
        {
          privateKey: key.privateKeyPem,
          algorithm: 'RS256',
          keyid: signOptions.kid ?? published[published.length - 1]!.kid,
          ...(signOptions.expiresInSeconds !== undefined
            ? { expiresIn: signOptions.expiresInSeconds }
            : {}),
        },
      );
    },

    /** O provedor gira a chave: a nova entra no JWKS e a antiga sai. */
    rotateKey(): string {
      published = [generateSigningKey(`kid-${++keyCounter}`)];
      return published[0]!.kid;
    },

    respondToTokenRequestWith(idToken: string | null, status = 200) {
      nextIdToken = idToken;
      tokenStatus = status;
    },
  };
}

export type FakeOidcProvider = ReturnType<typeof createFakeOidcProvider>;
