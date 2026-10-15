import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'crypto';
import { IdTokenError, IdTokenVerifier, JWKS_REFETCH_COOLDOWN_MS } from './id-token-verifier';
import { MICROSOFT_CONSUMER_TENANT_ID, OAUTH_PROVIDERS } from './oauth-providers';
import {
  createFakeOidcProvider,
  type FakeOidcProvider,
} from '../../../../tests/helpers/fake-oidc-provider';

const google = OAUTH_PROVIDERS.google;
const microsoft = OAUTH_PROVIDERS.microsoft;
const CLIENT_ID = 'client-id-123';
const NONCE = 'nonce-from-the-flow-cookie-0123456789';
const WORK_TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function googleClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    sub: 'google-sub-1',
    aud: CLIENT_ID,
    exp: nowSeconds() + 300,
    nonce: NONCE,
    email: 'Medica@Example.com',
    email_verified: true,
    name: 'Dra. Ana',
    ...overrides,
  };
}

async function expectFailure(promise: Promise<unknown>, failure: IdTokenError['failure']) {
  await expect(promise).rejects.toBeInstanceOf(IdTokenError);
  await expect(promise).rejects.toMatchObject({ failure });
}

describe('IdTokenVerifier (CC-334)', () => {
  let provider: FakeOidcProvider;
  let verifier: IdTokenVerifier;
  let fetchSpy: ReturnType<typeof vi.fn>;

  function build(fake: FakeOidcProvider) {
    fetchSpy = vi.fn(fake.fetch);
    return new IdTokenVerifier(new JwtService({}), fetchSpy as unknown as typeof fetch);
  }

  beforeEach(() => {
    provider = createFakeOidcProvider({
      jwksUri: google.jwksUri,
      tokenEndpoint: google.tokenEndpoint,
    });
    verifier = build(provider);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a valid id_token and returns its claims', async () => {
    const token = await provider.signIdToken(googleClaims());

    const claims = await verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE });

    expect(claims.sub).toBe('google-sub-1');
    expect(google.verifiedEmail(claims)).toBe('medica@example.com');
  });

  it('rejects an expired token', async () => {
    const token = await provider.signIdToken(googleClaims({ exp: nowSeconds() - 3600 }));
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'expired',
    );
  });

  it('rejects a token without exp (jsonwebtoken only checks exp when present)', async () => {
    const claims: Record<string, unknown> = googleClaims();
    delete claims.exp;
    const token = await provider.signIdToken(claims);
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'claims',
    );
  });

  it('rejects a token issued to another client (aud)', async () => {
    const token = await provider.signIdToken(googleClaims({ aud: 'someone-elses-client' }));
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'audience',
    );
  });

  it('rejects a token from another issuer', async () => {
    const token = await provider.signIdToken(googleClaims({ iss: 'https://evil.example.com' }));
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'issuer',
    );
  });

  it('rejects a nonce that is not the one from the flow', async () => {
    const token = await provider.signIdToken(googleClaims({ nonce: 'replayed-nonce' }));
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'nonce',
    );
  });

  it('rejects a token without nonce', async () => {
    const claims: Record<string, unknown> = googleClaims();
    delete claims.nonce;
    const token = await provider.signIdToken(claims);
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'nonce',
    );
  });

  it('rejects a token signed with a key that is not in the JWKS', async () => {
    const token = await provider.signIdToken(googleClaims(), { useOutsiderKey: true });
    await expectFailure(
      verifier.verify(google, token, { clientId: CLIENT_ID, nonce: NONCE }),
      'signature',
    );
  });

  it('rejects HS256 tokens (algorithm confusion) without touching the JWKS', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'kid-1' })).toString(
      'base64url',
    );
    const payload = Buffer.from(JSON.stringify(googleClaims())).toString('base64url');
    const signature = createHmac('sha256', 'public-key-as-secret')
      .update(`${header}.${payload}`)
      .digest('base64url');

    await expectFailure(
      verifier.verify(google, `${header}.${payload}.${signature}`, {
        clientId: CLIENT_ID,
        nonce: NONCE,
      }),
      'malformed',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects garbage', async () => {
    await expectFailure(
      verifier.verify(google, 'not-a-jwt', { clientId: CLIENT_ID, nonce: NONCE }),
      'malformed',
    );
  });

  describe('JWKS cache', () => {
    it('fetches the JWKS once for several logins', async () => {
      const first = await provider.signIdToken(googleClaims());
      const second = await provider.signIdToken(googleClaims({ sub: 'google-sub-2' }));

      await verifier.verify(google, first, { clientId: CLIENT_ID, nonce: NONCE });
      await verifier.verify(google, second, { clientId: CLIENT_ID, nonce: NONCE });

      expect(provider.jwksRequests).toBe(1);
    });

    it('refetches when the provider rotates its key', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      await verifier.verify(google, await provider.signIdToken(googleClaims()), {
        clientId: CLIENT_ID,
        nonce: NONCE,
      });

      provider.rotateKey();
      vi.setSystemTime(Date.now() + JWKS_REFETCH_COOLDOWN_MS + 1000);
      const rotated = await provider.signIdToken(googleClaims());

      await expect(
        verifier.verify(google, rotated, { clientId: CLIENT_ID, nonce: NONCE }),
      ).resolves.toMatchObject({ sub: 'google-sub-1' });
      expect(provider.jwksRequests).toBe(2);
    });

    it('does not refetch for an unknown kid inside the cooldown', async () => {
      await verifier.verify(google, await provider.signIdToken(googleClaims()), {
        clientId: CLIENT_ID,
        nonce: NONCE,
      });

      const forged = await provider.signIdToken(googleClaims(), { kid: 'made-up-kid' });
      await expectFailure(
        verifier.verify(google, forged, { clientId: CLIENT_ID, nonce: NONCE }),
        'unknown_key',
      );
      expect(provider.jwksRequests).toBe(1);
    });

    it('reports the JWKS as unavailable when the provider is down', async () => {
      const down = build({
        ...provider,
        fetch: (async () => new Response('down', { status: 503 })) as typeof fetch,
      } as FakeOidcProvider);

      await expectFailure(
        down.verify(google, await provider.signIdToken(googleClaims()), {
          clientId: CLIENT_ID,
          nonce: NONCE,
        }),
        'jwks_unavailable',
      );
    });
  });

  describe('Microsoft (common endpoint)', () => {
    let msProvider: FakeOidcProvider;
    let msVerifier: IdTokenVerifier;

    function microsoftClaims(overrides: Record<string, unknown> = {}) {
      return {
        iss: `https://login.microsoftonline.com/${WORK_TENANT}/v2.0`,
        tid: WORK_TENANT,
        sub: 'ms-sub-1',
        aud: CLIENT_ID,
        exp: nowSeconds() + 300,
        nonce: NONCE,
        email: 'medico@hospital.org',
        name: 'Dr. Bruno',
        ...overrides,
      };
    }

    beforeEach(() => {
      msProvider = createFakeOidcProvider({
        jwksUri: microsoft.jwksUri,
        tokenEndpoint: microsoft.tokenEndpoint,
      });
      msVerifier = build(msProvider);
    });

    it('accepts the issuer of the tenant named in the token', async () => {
      const token = await msProvider.signIdToken(microsoftClaims());
      await expect(
        msVerifier.verify(microsoft, token, { clientId: CLIENT_ID, nonce: NONCE }),
      ).resolves.toMatchObject({ sub: 'ms-sub-1' });
    });

    it('rejects an issuer that does not match the token tenant', async () => {
      const token = await msProvider.signIdToken(
        microsoftClaims({ iss: 'https://login.microsoftonline.com/common/v2.0' }),
      );
      await expectFailure(
        msVerifier.verify(microsoft, token, { clientId: CLIENT_ID, nonce: NONCE }),
        'issuer',
      );
    });

    it('rejects a token without tid', async () => {
      const claims: Record<string, unknown> = microsoftClaims();
      delete claims.tid;
      const token = await msProvider.signIdToken(claims);
      await expectFailure(
        msVerifier.verify(microsoft, token, { clientId: CLIENT_ID, nonce: NONCE }),
        'issuer',
      );
    });

    it('only trusts a work account email with xms_edov (nOAuth)', async () => {
      const unverified = await msVerifier.verify(
        microsoft,
        await msProvider.signIdToken(microsoftClaims()),
        { clientId: CLIENT_ID, nonce: NONCE },
      );
      const verified = await msVerifier.verify(
        microsoft,
        await msProvider.signIdToken(microsoftClaims({ xms_edov: true })),
        { clientId: CLIENT_ID, nonce: NONCE },
      );

      expect(microsoft.verifiedEmail(unverified)).toBeNull();
      expect(microsoft.verifiedEmail(verified)).toBe('medico@hospital.org');
    });

    it('trusts the email of a personal Microsoft account', async () => {
      const claims = await msVerifier.verify(
        microsoft,
        await msProvider.signIdToken(
          microsoftClaims({
            tid: MICROSOFT_CONSUMER_TENANT_ID,
            iss: `https://login.microsoftonline.com/${MICROSOFT_CONSUMER_TENANT_ID}/v2.0`,
            email: 'medica@outlook.com',
          }),
        ),
        { clientId: CLIENT_ID, nonce: NONCE },
      );
      expect(microsoft.verifiedEmail(claims)).toBe('medica@outlook.com');
    });
  });

  it('does not trust a Google email that is not verified', () => {
    expect(google.verifiedEmail({ ...googleClaims(), email_verified: false, iat: 0 })).toBeNull();
    expect(google.verifiedEmail({ ...googleClaims(), email_verified: 'true', iat: 0 })).toBe(
      'medica@example.com',
    );
  });
});
