import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

// CC-014 — a tela de segurança chamava POST /auth/me/password e a rota é
// PATCH: a troca de senha dava 404 sem ninguém notar. O web confere o verbo
// em security-tab.test.tsx; este teste prende o lado da API.
describe('AuthController routes', () => {
  it('changes the password with PATCH /auth/me/password', () => {
    const handler = AuthController.prototype.changePassword;

    expect(Reflect.getMetadata(PATH_METADATA, AuthController)).toBe('auth');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me/password');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
  });
});

// CC-026 — a trilha de auditoria grava o IP que o Traefik acrescentou ao
// X-Forwarded-For, o mesmo do limite por IP. Antes lia `req.ips?.[0] ??
// req.ip`: sem trustProxy (o caso da API) `req.ips` nem existe, e `req.ip` é o
// socket, o Traefik.
const CLIENT_IP = '203.0.113.7';
const FORGED_IP = '6.6.6.6';
const TRAEFIK_IP = '172.18.0.5';

function request(extra: Record<string, unknown> = {}) {
  return {
    headers: { 'x-forwarded-for': `${FORGED_IP}, ${CLIENT_IP}` },
    ip: TRAEFIK_IP,
    // O que o Fastify montaria com trustProxy: o socket e o XFF de trás para a frente.
    ips: [TRAEFIK_IP, CLIENT_IP, FORGED_IP],
    ...extra,
  } as unknown as FastifyRequest;
}

function reply() {
  return { setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply;
}

describe('CC-026 — AuthController: IP gravado na auditoria', () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS;
  const tokens = { accessToken: 'a.b.c', refreshToken: 'd.e.f' };
  let auth: Record<
    'register' | 'login' | 'refresh' | 'logout' | 'verifyMfaLogin',
    ReturnType<typeof vi.fn>
  >;
  let controller: AuthController;

  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    auth = {
      register: vi.fn().mockResolvedValue({ physician: {}, ...tokens }),
      login: vi.fn().mockResolvedValue({ mfaRequired: false, physician: {}, ...tokens }),
      refresh: vi.fn().mockResolvedValue(tokens),
      logout: vi.fn().mockResolvedValue(undefined),
      verifyMfaLogin: vi.fn().mockResolvedValue({ mfaRequired: false, physician: {}, ...tokens }),
    };
    controller = new AuthController(auth as unknown as AuthService, {} as MfaService);
  });

  afterEach(() => {
    if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = originalHops;
  });

  it('login', async () => {
    const body = { email: 'doctor@example.com', password: 'x' };
    await controller.login(body, request(), reply());
    expect(auth.login).toHaveBeenCalledWith(body, CLIENT_IP);
  });

  it('cadastro', async () => {
    const body = { email: 'doctor@example.com' } as never;
    await controller.register(body, request(), reply());
    expect(auth.register).toHaveBeenCalledWith(body, CLIENT_IP);
  });

  it('refresh', async () => {
    await controller.refresh({}, request({ cookies: { refresh_token: 'rt' } }), reply());
    expect(auth.refresh).toHaveBeenCalledWith({ refreshToken: 'rt' }, CLIENT_IP);
  });

  it('logout', async () => {
    const req = request({ user: { physicianId: 'phy-1' }, cookies: {} });
    await controller.logout(req as never, {}, reply());
    expect(auth.logout).toHaveBeenCalledWith('phy-1', undefined, CLIENT_IP);
  });

  it('código do MFA', async () => {
    await controller.mfaVerify({ mfaToken: 't', code: '123456' }, request(), reply());
    expect(auth.verifyMfaLogin).toHaveBeenCalledWith('t', '123456', CLIENT_IP);
  });

  it('segue TRUSTED_PROXY_HOPS (Cloudflare na frente: o penúltimo)', async () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    const req = request({
      headers: { 'x-forwarded-for': `${FORGED_IP}, ${CLIENT_IP}, 172.70.1.1` },
    });
    await controller.login({ email: 'doctor@example.com', password: 'x' }, req, reply());
    expect(auth.login).toHaveBeenCalledWith(expect.anything(), CLIENT_IP);
  });
});
