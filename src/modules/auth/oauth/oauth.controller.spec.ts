import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { OAuthController } from './oauth.controller';
import type { OAuthService } from './oauth.service';

const LANDING = 'https://copiloto.servidortozato.cloud/login/oauth';

function fakeReply() {
  const state = {
    cookies: new Map<string, { value: string; options: Record<string, unknown> }>(),
    cleared: [] as Array<{ name: string; options: Record<string, unknown> }>,
    headers: {} as Record<string, string>,
    redirect: null as { url: string; code: number } | null,
  };
  const reply = {
    setCookie: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
      state.cookies.set(name, { value, options });
      return reply;
    }),
    clearCookie: vi.fn((name: string, options: Record<string, unknown>) => {
      state.cleared.push({ name, options });
      return reply;
    }),
    header: vi.fn((key: string, value: string) => {
      state.headers[key] = value;
      return reply;
    }),
    redirect: vi.fn((url: string, code: number) => {
      state.redirect = { url, code };
      return reply;
    }),
  };
  return { reply: reply as unknown as FastifyReply, state };
}

function fakeRequest(cookies: Record<string, string> = {}) {
  return { cookies, ip: '10.0.0.1' } as unknown as FastifyRequest & {
    cookies: Record<string, string>;
  };
}

describe('OAuthController (CC-334)', () => {
  let service: {
    enabledProviders: ReturnType<typeof vi.fn>;
    landingUrl: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    handleCallback: ReturnType<typeof vi.fn>;
    readPending: ReturnType<typeof vi.fn>;
    completeSignup: ReturnType<typeof vi.fn>;
    confirmLink: ReturnType<typeof vi.fn>;
  };
  let controller: OAuthController;

  beforeEach(() => {
    service = {
      enabledProviders: vi.fn().mockReturnValue(['google']),
      landingUrl: vi.fn().mockReturnValue(LANDING),
      start: vi.fn(),
      handleCallback: vi.fn(),
      readPending: vi.fn(),
      completeSignup: vi.fn(),
      confirmLink: vi.fn(),
    };
    controller = new OAuthController(
      service as unknown as OAuthService,
      new ConfigService({ API_PREFIX: 'v1' }),
    );
  });

  it('lists the configured providers', () => {
    expect(controller.providers()).toEqual({ providers: ['google'] });
  });

  describe('start', () => {
    it('404s an unknown provider', async () => {
      const { reply } = fakeReply();
      await expect(controller.start('github', reply)).rejects.toThrow(NotFoundException);
    });

    it('sends the browser back with "unavailable" when the provider is off', async () => {
      service.start.mockResolvedValue(null);
      const { reply, state } = fakeReply();

      await controller.start('google', reply);

      expect(state.redirect).toEqual({
        url: `${LANDING}?status=error&reason=unavailable`,
        code: 302,
      });
      expect(state.cookies.size).toBe(0);
    });

    it('sets a Lax, httpOnly flow cookie scoped to the OAuth routes', async () => {
      service.start.mockResolvedValue({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        flowToken: 'flow-token',
      });
      const { reply, state } = fakeReply();

      await controller.start('google', reply);

      expect(state.cookies.get('oauth_flow')).toEqual({
        value: 'flow-token',
        options: {
          httpOnly: true,
          secure: true,
          // Strict não iria no callback, que é uma navegação vinda do provedor.
          sameSite: 'lax',
          path: '/v1/auth/oauth',
          maxAge: 600,
        },
      });
      expect(state.redirect).toEqual({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        code: 302,
      });
    });
  });

  describe('callback', () => {
    it('opens the session in cookies and lands with status=ok only', async () => {
      service.handleCallback.mockResolvedValue({
        status: 'ok',
        accessToken: 'header.eyJleHAiOjQxMDI0NDQ4MDB9.sig',
        refreshToken: 'header.eyJleHAiOjQxMDI0NDQ4MDB9.sig',
      });
      const { reply, state } = fakeReply();

      await controller.callback(
        'google',
        { code: 'c', state: 's' },
        fakeRequest({ oauth_flow: 'flow-token' }),
        reply,
      );

      expect(service.handleCallback).toHaveBeenCalledWith(
        'google',
        { code: 'c', state: 's' },
        'flow-token',
        '10.0.0.1',
      );
      expect([...state.cookies.keys()]).toEqual(['access_token', 'refresh_token']);
      expect(state.cleared).toContainEqual({
        name: 'oauth_flow',
        options: { path: '/v1/auth/oauth' },
      });
      expect(state.redirect).toEqual({ url: `${LANDING}?status=ok`, code: 302 });
    });

    it('keeps the next step in a pending cookie, never in the URL', async () => {
      service.handleCallback.mockResolvedValue({ status: 'signup', pendingToken: 'pending-jwt' });
      const { reply, state } = fakeReply();

      await controller.callback('google', { code: 'c', state: 's' }, fakeRequest(), reply);

      expect(state.cookies.get('oauth_pending')?.options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/v1/auth/oauth',
        maxAge: 900,
      });
      expect(state.redirect?.url).toBe(`${LANDING}?status=signup`);
      expect(state.redirect?.url).not.toContain('pending-jwt');
    });

    it('lands with the error reason', async () => {
      service.handleCallback.mockResolvedValue({ status: 'error', reason: 'state_mismatch' });
      const { reply, state } = fakeReply();

      await controller.callback('google', { code: 'c', state: 's' }, fakeRequest(), reply);

      expect(state.redirect?.url).toBe(`${LANDING}?status=error&reason=state_mismatch`);
    });

    it('does not call the service with a malformed query', async () => {
      const { reply, state } = fakeReply();

      await controller.callback('google', { code: 'x'.repeat(5000) }, fakeRequest(), reply);

      expect(service.handleCallback).not.toHaveBeenCalled();
      expect(state.redirect?.url).toBe(`${LANDING}?status=error&reason=provider_error`);
    });
  });

  describe('link', () => {
    it('returns the MFA step without opening a session', async () => {
      service.confirmLink.mockResolvedValue({ mfaRequired: true, mfaToken: 'mfa-token' });
      const { reply, state } = fakeReply();

      const result = await controller.link(
        { password: 'Senha@Forte1' },
        fakeRequest({ oauth_pending: 'pending-jwt' }),
        reply,
      );

      expect(service.confirmLink).toHaveBeenCalledWith('pending-jwt', 'Senha@Forte1', '10.0.0.1');
      expect(result).toEqual({ mfaRequired: true, mfaToken: 'mfa-token' });
      expect(state.cookies.has('access_token')).toBe(false);
      expect(state.cleared).toContainEqual({
        name: 'oauth_pending',
        options: { path: '/v1/auth/oauth' },
      });
    });
  });
});
