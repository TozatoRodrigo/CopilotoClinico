import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Controller, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';

const CLIENT_IP = '203.0.113.7';
const TRAEFIK_IP = '172.18.0.5';

@Controller('auth')
class FakeAuthController {
  login() {}
}

@Controller('encounters')
class FakeEncountersController {
  list() {}
}

function contextFor(
  controller: { prototype: object },
  handler: () => void,
  xff: string | undefined,
): ExecutionContext {
  const req = { headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, ip: TRAEFIK_IP };
  const res = { header: vi.fn() };
  return {
    getType: () => 'http',
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('CC-025 — ThrottlerBehindProxyGuard', () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS;
  let storage: ThrottlerStorageService;
  let warn: MockInstance<Logger['warn']>;

  async function buildGuard(hops: string | undefined, limit = 2) {
    if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = hops;
    const guard = new ThrottlerBehindProxyGuard(
      { throttlers: [{ name: 'short', ttl: 60_000, limit }] },
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    return guard;
  }

  function trackerOf(guard: ThrottlerBehindProxyGuard, xff: string | undefined): Promise<string> {
    const req = contextFor(FakeAuthController, FakeAuthController.prototype.login, xff)
      .switchToHttp()
      .getRequest();
    // getTracker é protegido: o teste chama direto para isolar a escolha do IP.
    return (guard as unknown as { getTracker(r: unknown): Promise<string> }).getTracker(req);
  }

  beforeEach(() => {
    storage = new ThrottlerStorageService();
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    warn.mockRestore();
    if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = originalHops;
  });

  it('padrão (sem env): 1 salto, o último IP do XFF', async () => {
    const guard = await buildGuard(undefined);
    await expect(trackerOf(guard, `1.1.1.1, ${CLIENT_IP}`)).resolves.toBe(CLIENT_IP);
    expect(warn).not.toHaveBeenCalled();
  });

  it('TRUSTED_PROXY_HOPS=0 ignora o XFF', async () => {
    const guard = await buildGuard('0');
    await expect(trackerOf(guard, `1.1.1.1, ${CLIENT_IP}`)).resolves.toBe(TRAEFIK_IP);
  });

  it('TRUSTED_PROXY_HOPS=2 usa o penúltimo', async () => {
    const guard = await buildGuard('2');
    await expect(trackerOf(guard, `6.6.6.6, ${CLIENT_IP}, 172.70.1.1`)).resolves.toBe(CLIENT_IP);
  });

  it('valor inválido: avisa uma vez e usa 1', async () => {
    const guard = await buildGuard('dois');
    await expect(trackerOf(guard, `1.1.1.1, ${CLIENT_IP}`)).resolves.toBe(CLIENT_IP);
    await trackerOf(guard, CLIENT_IP);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('TRUSTED_PROXY_HOPS inválido ("dois")');
  });

  it('variar o XFF forjado não reinicia o limite do login', async () => {
    const guard = await buildGuard('1', 2);
    const login = FakeAuthController.prototype.login;

    await expect(
      guard.canActivate(contextFor(FakeAuthController, login, `1.1.1.1, ${CLIENT_IP}`)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(FakeAuthController, login, `2.2.2.2, ${CLIENT_IP}`)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(FakeAuthController, login, `3.3.3.3, ${CLIENT_IP}`)),
    ).rejects.toThrow(ThrottlerException);
  });

  it('loga AUTH_RATE_LIMITED reason=ip uma vez por bloqueio, sem o IP', async () => {
    const guard = await buildGuard('1', 1);
    const login = FakeAuthController.prototype.login;
    const attempt = () => guard.canActivate(contextFor(FakeAuthController, login, CLIENT_IP));

    await attempt();
    await expect(attempt()).rejects.toThrow(ThrottlerException);
    await expect(attempt()).rejects.toThrow(ThrottlerException);

    const lines = warn.mock.calls.map(([message]) => String(message));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^AUTH_RATE_LIMITED reason=ip route=FakeAuthController\.login limit=1 ttlMs=60000 blockedForS=\d+$/,
    );
    expect(lines[0]).not.toContain(CLIENT_IP);
  });

  it('fora do controller de auth o evento é RATE_LIMITED', async () => {
    const guard = await buildGuard('1', 1);
    const list = FakeEncountersController.prototype.list;
    const attempt = () => guard.canActivate(contextFor(FakeEncountersController, list, CLIENT_IP));

    await attempt();
    await expect(attempt()).rejects.toThrow(ThrottlerException);

    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^RATE_LIMITED reason=ip /);
  });
});
