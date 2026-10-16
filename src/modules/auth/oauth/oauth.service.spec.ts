import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from '../auth.service';
import { MfaService } from '../mfa.service';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../../config/prisma.service';
import { CrmVerificationService } from '../../physicians/crm-verification.service';
import { CrmCheckerService } from '../../physicians/crm-checker.service';
import { ExternalIdentityService } from './external-identity.service';
import { IdTokenVerifier } from './id-token-verifier';
import { OAUTH_PROVIDERS } from './oauth-providers';
import { OAuthService, type OAuthCallbackOutcome } from './oauth.service';
import {
  createFakeOidcProvider,
  type FakeOidcProvider,
} from '../../../../tests/helpers/fake-oidc-provider';
import type { OAuthProviderId } from '../../../shared/contracts/oauth';

const ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
const PUBLIC_URL = 'https://copiloto.servidortozato.cloud';
const WORK_TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const MFA_CODE = '123456';
const PASSWORD = 'Senha@Forte1';

const BASE_CONFIG = {
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
  APP_PUBLIC_URL: PUBLIC_URL,
  OAUTH_GOOGLE_CLIENT_ID: 'google-client-id',
  OAUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
  OAUTH_MICROSOFT_CLIENT_ID: 'microsoft-client-id',
  OAUTH_MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
};

interface PhysicianRow {
  id: string;
  email: string;
  passwordHash: string | null;
  crmUf: string;
  crmNumber: string;
  name: string | null;
  crmVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  role: 'PHYSICIAN';
  locale: string;
  createdAt: Date;
}

interface IdentityRow {
  id: string;
  physicianId: string;
  provider: OAuthProviderId;
  subject: string;
  emailAtLink: string;
  lastLoginAt: Date | null;
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/** Banco em memória com só o que o fluxo OAuth usa. */
function createFakePrisma() {
  const physicians: PhysicianRow[] = [];
  const identities: IdentityRow[] = [];
  let nextId = 1;

  const prisma = {
    physicians,
    identities,
    physician: {
      findFirst: vi.fn(async ({ where }: { where: { email: { equals: string } } }) => {
        const email = where.email.equals.toLowerCase();
        return physicians.find((p) => p.email.toLowerCase() === email) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        return physicians.find((p) => p.id === where.id || p.email === where.email) ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<
            PhysicianRow,
            'id' | 'crmVerified' | 'mfaEnabled' | 'mfaSecret' | 'role' | 'locale' | 'createdAt'
          > & {
            externalIdentities?: { create: Omit<IdentityRow, 'id' | 'physicianId'> };
          };
        }) => {
          if (physicians.some((p) => p.email.toLowerCase() === data.email.toLowerCase())) {
            throw uniqueViolation();
          }
          const row: PhysicianRow = {
            id: `physician-${nextId++}`,
            email: data.email,
            passwordHash: data.passwordHash,
            crmUf: data.crmUf,
            crmNumber: data.crmNumber,
            name: data.name,
            crmVerified: false,
            mfaEnabled: false,
            mfaSecret: null,
            role: 'PHYSICIAN',
            locale: 'pt-BR',
            createdAt: new Date(),
          };
          physicians.push(row);
          const identity = data.externalIdentities?.create;
          if (identity) {
            identities.push({ id: `identity-${nextId++}`, physicianId: row.id, ...identity });
          }
          return row;
        },
      ),
    },
    externalIdentity: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { provider_subject: { provider: OAuthProviderId; subject: string } };
          include?: { physician: true };
        }) => {
          const { provider, subject } = where.provider_subject;
          const identity = identities.find((i) => i.provider === provider && i.subject === subject);
          if (!identity) return null;
          return include
            ? { ...identity, physician: physicians.find((p) => p.id === identity.physicianId) }
            : identity;
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<IdentityRow> }) => {
          const identity = identities.find((i) => i.id === where.id);
          if (identity) Object.assign(identity, data);
          return identity;
        },
      ),
      create: vi.fn(async ({ data }: { data: Omit<IdentityRow, 'id'> }) => {
        if (identities.some((i) => i.provider === data.provider && i.subject === data.subject)) {
          throw uniqueViolation();
        }
        const row = { id: `identity-${nextId++}`, ...data };
        identities.push(row);
        return row;
      }),
    },
    refreshToken: { create: vi.fn().mockResolvedValue({}) },
    loginSecurityState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return prisma;
}

type FakePrisma = ReturnType<typeof createFakePrisma>;

describe('OAuthService (CC-334)', () => {
  let prisma: FakePrisma;
  let audit: { log: ReturnType<typeof vi.fn> };
  let mfa: { verifyMfaCode: ReturnType<typeof vi.fn> };
  let jwt: JwtService;
  let googleIdp: FakeOidcProvider;
  let microsoftIdp: FakeOidcProvider;
  let authService: AuthService;
  let oauth: OAuthService;

  function build(configOverrides: Record<string, string | undefined> = {}) {
    const config = new ConfigService({ ...BASE_CONFIG, ...configOverrides });
    const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.startsWith('https://login.microsoftonline.com')
        ? microsoftIdp.fetch(input, init)
        : googleIdp.fetch(input, init);
    }) as typeof fetch;

    const externalIdentities = new ExternalIdentityService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      audit as unknown as AuditService,
      // CC-025 — os testes do limite por conta estão em auth.service.lockout.spec.ts.
      { reserveAttempt: vi.fn(), clear: vi.fn() } as never,
      mfa as unknown as MfaService,
      // CC-702 — o beta só entra no cadastro por senha.
      { admit: vi.fn(), createAccount: vi.fn() } as never,
      {} as CrmVerificationService,
      {
        check: vi.fn().mockResolvedValue({ valid: false, source: 'unavailable' }),
      } as unknown as CrmCheckerService,
      externalIdentities,
    );
    oauth = new OAuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      audit as unknown as AuditService,
      authService,
      externalIdentities,
      new IdTokenVerifier(jwt, fetchImpl),
      fetchImpl,
    );
  }

  function idp(provider: OAuthProviderId): FakeOidcProvider {
    return provider === 'google' ? googleIdp : microsoftIdp;
  }

  function baseClaims(provider: OAuthProviderId, nonce: string): Record<string, unknown> {
    const exp = Math.floor(Date.now() / 1000) + 300;
    return provider === 'google'
      ? {
          iss: 'https://accounts.google.com',
          aud: BASE_CONFIG.OAUTH_GOOGLE_CLIENT_ID,
          sub: 'google-sub-1',
          exp,
          nonce,
          email: 'medica@example.com',
          email_verified: true,
          name: 'Dra. Ana Souza',
        }
      : {
          iss: `https://login.microsoftonline.com/${WORK_TENANT}/v2.0`,
          tid: WORK_TENANT,
          aud: BASE_CONFIG.OAUTH_MICROSOFT_CLIENT_ID,
          sub: 'microsoft-sub-1',
          exp,
          nonce,
          email: 'medica@example.com',
          xms_edov: true,
          name: 'Dra. Ana Souza',
        };
  }

  /** Navegador: start → provedor (falso) → callback com o state e o cookie do fluxo. */
  async function signInWith(
    provider: OAuthProviderId,
    claimOverrides: Record<string, unknown> = {},
    tamper: { state?: string; flowToken?: string | null } = {},
  ): Promise<OAuthCallbackOutcome> {
    const started = await oauth.start(provider);
    if (!started) throw new Error('provider not configured');
    const url = new URL(started.authorizationUrl);
    const nonce = url.searchParams.get('nonce') ?? '';
    const state = url.searchParams.get('state') ?? '';

    idp(provider).respondToTokenRequestWith(
      await idp(provider).signIdToken({ ...baseClaims(provider, nonce), ...claimOverrides }),
    );
    const flowToken =
      tamper.flowToken === null ? undefined : (tamper.flowToken ?? started.flowToken);
    return oauth.handleCallback(
      provider,
      { code: 'authorization-code', state: tamper.state ?? state },
      flowToken,
      '10.0.0.1',
    );
  }

  async function seedPhysician(overrides: Partial<PhysicianRow> = {}): Promise<PhysicianRow> {
    const row: PhysicianRow = {
      id: `existing-${prisma.physicians.length + 1}`,
      email: 'Medica@Example.com',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      crmUf: 'SP',
      crmNumber: '123456',
      name: 'Dra. Ana Souza',
      crmVerified: true,
      mfaEnabled: false,
      mfaSecret: null,
      role: 'PHYSICIAN',
      locale: 'pt-BR',
      createdAt: new Date(),
      ...overrides,
    };
    prisma.physicians.push(row);
    return row;
  }

  function pendingToken(outcome: OAuthCallbackOutcome): string {
    if (!('pendingToken' in outcome)) {
      throw new Error(`expected a pending step, got ${JSON.stringify(outcome)}`);
    }
    return outcome.pendingToken;
  }

  function auditActions(): string[] {
    return audit.log.mock.calls.map(([entry]) => (entry as { action: string }).action);
  }

  beforeEach(() => {
    prisma = createFakePrisma();
    audit = { log: vi.fn().mockResolvedValue({}) };
    mfa = {
      verifyMfaCode: vi.fn(async (_physicianId: string, code: string) => {
        if (code !== MFA_CODE) throw new UnauthorizedException('Invalid MFA code');
      }),
    };
    jwt = new JwtService({});
    googleIdp = createFakeOidcProvider({
      jwksUri: OAUTH_PROVIDERS.google.jwksUri,
      tokenEndpoint: OAUTH_PROVIDERS.google.tokenEndpoint,
    });
    microsoftIdp = createFakeOidcProvider({
      jwksUri: OAUTH_PROVIDERS.microsoft.jwksUri,
      tokenEndpoint: OAUTH_PROVIDERS.microsoft.tokenEndpoint,
    });
    build();
  });

  describe('configuration', () => {
    it('lists only providers with client id and secret', () => {
      build({ OAUTH_MICROSOFT_CLIENT_SECRET: '' });
      expect(oauth.enabledProviders()).toEqual(['google']);
    });

    it('turns everything off without APP_PUBLIC_URL', async () => {
      build({ APP_PUBLIC_URL: undefined });
      expect(oauth.enabledProviders()).toEqual([]);
      await expect(oauth.start('google')).resolves.toBeNull();
    });
  });

  describe('start', () => {
    it('sends the browser to the provider with PKCE (S256), state and nonce', async () => {
      const started = await oauth.start('google');
      if (!started) throw new Error('expected google to be configured');
      const url = new URL(started.authorizationUrl);
      const flow = jwt.decode(started.flowToken) as { codeVerifier: string; state: string };

      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('google-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(
        `${PUBLIC_URL}/v1/auth/oauth/google/callback`,
      );
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBe(
        createHash('sha256').update(flow.codeVerifier).digest('base64url'),
      );
      expect(url.searchParams.get('state')).toBe(flow.state);
      // O segredo do cliente e o verifier nunca vão para o navegador.
      expect(started.authorizationUrl).not.toContain('google-client-secret');
      expect(started.authorizationUrl).not.toContain(flow.codeVerifier);
    });

    it('uses the common endpoint for Microsoft', async () => {
      const started = await oauth.start('microsoft');
      expect(started?.authorizationUrl).toMatch(
        /^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize\?/,
      );
    });

    it('exchanges the code on the server with the verifier and the client secret', async () => {
      await signInWith('google');
      const request = googleIdp.tokenRequests[0];
      expect(request?.body.get('grant_type')).toBe('authorization_code');
      expect(request?.body.get('code')).toBe('authorization-code');
      expect(request?.body.get('client_secret')).toBe('google-client-secret');
      expect(request?.body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    });

    it('signs flow and pending cookies with secrets that are not session secrets', async () => {
      const started = await oauth.start('google');
      if (!started) throw new Error('expected google to be configured');
      await expect(jwt.verifyAsync(started.flowToken, { secret: ACCESS_SECRET })).rejects.toThrow();

      const outcome = await signInWith('google');
      await expect(
        jwt.verifyAsync(pendingToken(outcome), { secret: ACCESS_SECRET }),
      ).rejects.toThrow();
    });
  });

  describe('callback: state', () => {
    it('refuses a callback without the flow cookie', async () => {
      const outcome = await signInWith('google', {}, { flowToken: null });
      expect(outcome).toEqual({ status: 'error', reason: 'state_mismatch' });
      expect(googleIdp.tokenRequests).toHaveLength(0);
    });

    it('refuses a state that is not the one in the flow cookie', async () => {
      const outcome = await signInWith('google', {}, { state: 'attacker-state-0123456789' });
      expect(outcome).toEqual({ status: 'error', reason: 'state_mismatch' });
      expect(googleIdp.tokenRequests).toHaveLength(0);
    });

    it('refuses a flow cookie started for another provider', async () => {
      const google = await oauth.start('google');
      const state = new URL(google?.authorizationUrl ?? '').searchParams.get('state') ?? '';
      const outcome = await oauth.handleCallback(
        'microsoft',
        { code: 'authorization-code', state },
        google?.flowToken,
      );
      expect(outcome).toEqual({ status: 'error', reason: 'state_mismatch' });
    });

    it('refuses a forged flow cookie', async () => {
      const forged = await jwt.signAsync(
        {
          scope: 'oauth_flow',
          provider: 'google',
          state: 's'.repeat(43),
          nonce: 'n'.repeat(43),
          codeVerifier: 'v'.repeat(43),
        },
        { secret: ACCESS_SECRET },
      );
      const outcome = await signInWith('google', {}, { flowToken: forged, state: 's'.repeat(43) });
      expect(outcome).toEqual({ status: 'error', reason: 'state_mismatch' });
    });

    it('audits the failure without personal data', async () => {
      await signInWith('google', {}, { state: 'attacker-state-0123456789' });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: 'unknown',
        action: 'AUTH_LOGIN_FAILED',
        entity: 'Physician',
        entityId: 'unknown',
        payload: { reason: 'state_mismatch', method: 'oauth', provider: 'google' },
        ip: '10.0.0.1',
      });
    });
  });

  describe('callback: id_token', () => {
    it.each([
      ['nonce', { nonce: 'nonce-from-another-flow-000000000' }],
      ['expired', { exp: Math.floor(Date.now() / 1000) - 3600 }],
      ['aud', { aud: 'another-client-id' }],
      ['iss', { iss: 'https://accounts.evil.example' }],
    ])('refuses an invalid id_token (%s)', async (_label, override) => {
      const outcome = await signInWith('google', override);
      expect(outcome).toEqual({ status: 'error', reason: 'invalid_token' });
      expect(prisma.physician.create).not.toHaveBeenCalled();
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('medica@example.com');
    });

    it('reports a provider error when the code exchange fails', async () => {
      const started = await oauth.start('google');
      googleIdp.respondToTokenRequestWith(null, 400);
      const state = new URL(started?.authorizationUrl ?? '').searchParams.get('state') ?? '';
      const outcome = await oauth.handleCallback(
        'google',
        { code: 'expired-code', state },
        started?.flowToken,
      );
      expect(outcome).toEqual({ status: 'error', reason: 'provider_error' });
    });

    it('treats access_denied as the user giving up, without auditing a failure', async () => {
      const started = await oauth.start('google');
      const outcome = await oauth.handleCallback(
        'google',
        { error: 'access_denied' },
        started?.flowToken,
      );
      expect(outcome).toEqual({ status: 'error', reason: 'cancelled' });
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('new account', () => {
    it('asks for the CRM before creating anything', async () => {
      const outcome = await signInWith('google');

      expect(outcome.status).toBe('signup');
      expect(prisma.physician.create).not.toHaveBeenCalled();
      await expect(oauth.readPending(pendingToken(outcome))).resolves.toEqual({
        kind: 'signup',
        provider: 'google',
        email: 'medica@example.com',
        name: 'Dra. Ana Souza',
      });
    });

    it('creates the account with the CRM, without a password, already linked', async () => {
      const outcome = await signInWith('google');

      const result = await oauth.completeSignup(
        pendingToken(outcome),
        { crmUf: 'RJ', crmNumber: '52123' },
        '10.0.0.1',
      );

      expect(result.physician).toMatchObject({
        email: 'medica@example.com',
        crmUf: 'RJ',
        crmNumber: '52123',
        name: 'Dra. Ana Souza',
        hasPassword: false,
      });
      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.physicians[0]?.passwordHash).toBeNull();
      expect(prisma.identities).toEqual([
        expect.objectContaining({
          physicianId: prisma.physicians[0]?.id,
          provider: 'google',
          subject: 'google-sub-1',
          emailAtLink: 'medica@example.com',
        }),
      ]);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_REGISTER',
          payload: { crmUf: 'RJ', method: 'oauth', provider: 'google' },
        }),
      );
    });

    it('signs straight in on the next login with the same account', async () => {
      const first = await signInWith('google');
      await oauth.completeSignup(pendingToken(first), { crmUf: 'RJ', crmNumber: '52123' });

      const second = await signInWith('google');
      expect(second).toEqual({
        status: 'ok',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('refuses to finish a signup without the pending cookie', async () => {
      await expect(
        oauth.completeSignup(undefined, { crmUf: 'RJ', crmNumber: '52123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to use a link step to finish a signup', async () => {
      await seedPhysician();
      const outcome = await signInWith('google');
      expect(outcome.status).toBe('link');

      await expect(
        oauth.completeSignup(pendingToken(outcome), { crmUf: 'RJ', crmNumber: '52123' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.physician.create).not.toHaveBeenCalled();
    });

    it('refuses an email the provider did not verify', async () => {
      const outcome = await signInWith('google', { email_verified: false });

      expect(outcome).toEqual({ status: 'error', reason: 'email_unverified' });
      expect(prisma.physician.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a Microsoft work account email without xms_edov', async () => {
      const outcome = await signInWith('microsoft', { xms_edov: undefined });
      expect(outcome).toEqual({ status: 'error', reason: 'email_unverified' });
    });
  });

  describe('existing account with the same email', () => {
    it('never links automatically: asks for the password', async () => {
      const physician = await seedPhysician();

      const outcome = await signInWith('google');

      expect(outcome.status).toBe('link');
      expect(prisma.identities).toHaveLength(0);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      await expect(oauth.readPending(pendingToken(outcome))).resolves.toEqual({
        kind: 'link',
        provider: 'google',
        email: 'medica@example.com',
      });
      expect(JSON.stringify(await oauth.readPending(pendingToken(outcome)))).not.toContain(
        physician.id,
      );
    });

    it('does not link with a wrong password, and counts the attempt', async () => {
      const physician = await seedPhysician();
      const outcome = await signInWith('google');

      await expect(
        oauth.confirmLink(pendingToken(outcome), 'senha-errada', '10.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.identities).toHaveLength(0);
      expect(prisma.loginSecurityState.upsert).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith({
        actorId: physician.id,
        action: 'AUTH_OAUTH_LINK_FAILED',
        entity: 'Physician',
        entityId: physician.id,
        payload: { provider: 'google', reason: 'invalid_password' },
        ip: '10.0.0.1',
      });
    });

    it('links after the password and opens the session', async () => {
      const physician = await seedPhysician();
      const outcome = await signInWith('google');

      const result = await oauth.confirmLink(pendingToken(outcome), PASSWORD, '10.0.0.1');

      expect(result.mfaRequired).toBe(false);
      expect(prisma.identities).toEqual([
        expect.objectContaining({
          physicianId: physician.id,
          provider: 'google',
          subject: 'google-sub-1',
        }),
      ]);
      expect(audit.log).toHaveBeenCalledWith({
        actorId: physician.id,
        action: 'AUTH_OAUTH_LINKED',
        entity: 'Physician',
        entityId: physician.id,
        payload: { provider: 'google' },
        ip: '10.0.0.1',
      });

      // Depois do vínculo, a mesma conta Google entra direto.
      await expect(signInWith('google')).resolves.toMatchObject({ status: 'ok' });
    });

    it('with MFA on, links only after the second factor', async () => {
      const physician = await seedPhysician({ mfaEnabled: true });
      const outcome = await signInWith('google');

      const result = await oauth.confirmLink(pendingToken(outcome), PASSWORD);
      if (!result.mfaRequired) throw new Error('expected MFA to be required');
      expect(prisma.identities).toHaveLength(0);

      await expect(authService.verifyMfaLogin(result.mfaToken, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.identities).toHaveLength(0);

      await authService.verifyMfaLogin(result.mfaToken, MFA_CODE);
      expect(prisma.identities).toEqual([
        expect.objectContaining({ physicianId: physician.id, subject: 'google-sub-1' }),
      ]);
    });
  });

  describe('linked account', () => {
    it('signs in and records the last login', async () => {
      const physician = await seedPhysician();
      prisma.identities.push({
        id: 'identity-linked',
        physicianId: physician.id,
        provider: 'microsoft',
        subject: 'microsoft-sub-1',
        emailAtLink: 'medica@example.com',
        lastLoginAt: null,
      });

      const outcome = await signInWith('microsoft');

      expect(outcome.status).toBe('ok');
      expect(prisma.identities[0]?.lastLoginAt).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN',
          payload: { method: 'oauth', provider: 'microsoft' },
        }),
      );
    });

    it('still requires MFA when it is on', async () => {
      const physician = await seedPhysician({ mfaEnabled: true });
      prisma.identities.push({
        id: 'identity-linked',
        physicianId: physician.id,
        provider: 'google',
        subject: 'google-sub-1',
        emailAtLink: 'medica@example.com',
        lastLoginAt: null,
      });

      const outcome = await signInWith('google');

      expect(outcome.status).toBe('mfa');
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      const pending = await oauth.readPending(pendingToken(outcome));
      if (pending.kind !== 'mfa') throw new Error('expected an MFA step');

      const session = await authService.verifyMfaLogin(pending.mfaToken, MFA_CODE, '10.0.0.1');
      expect(session.accessToken).toEqual(expect.any(String));
      expect(auditActions()).toEqual(['AUTH_LOGIN_MFA_REQUIRED', 'AUTH_LOGIN']);
      expect(audit.log).toHaveBeenLastCalledWith(
        expect.objectContaining({ payload: { mfa: true, method: 'oauth', provider: 'google' } }),
      );
    });

    it('keys on the subject, not on the email the provider sends today', async () => {
      const physician = await seedPhysician();
      prisma.identities.push({
        id: 'identity-linked',
        physicianId: physician.id,
        provider: 'google',
        subject: 'google-sub-1',
        emailAtLink: 'medica@example.com',
        lastLoginAt: null,
      });

      const outcome = await signInWith('google', {
        email: 'outro-email@example.com',
        email_verified: false,
      });

      expect(outcome.status).toBe('ok');
    });
  });
});
