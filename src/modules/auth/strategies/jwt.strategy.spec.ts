import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { PhysicianErasureCheck } from '../physician-erasure-check.service';

describe('JwtStrategy', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  });

  function buildStrategy(erasedIds: string[] = []) {
    const erasureCheck = {
      isErased: vi.fn(async (physicianId: string) => erasedIds.includes(physicianId)),
    };
    const strategy = new JwtStrategy(config, erasureCheck as unknown as PhysicianErasureCheck);
    return { strategy, erasureCheck };
  }

  const payload = {
    sub: 'physician-1',
    email: 'doctor@example.com',
    physicianId: 'physician-1',
    role: 'PHYSICIAN',
  };

  it('returns the user context for a normal session payload', async () => {
    const { strategy, erasureCheck } = buildStrategy();

    await expect(strategy.validate(payload)).resolves.toEqual({
      sub: 'physician-1',
      email: 'doctor@example.com',
      physicianId: 'physician-1',
      role: 'PHYSICIAN',
    });
    expect(erasureCheck.isErased).toHaveBeenCalledWith('physician-1');
  });

  // SEC-01 — regression: um token de propósito restrito (ex.: mfa_pending,
  // emitido após senha correta mas ANTES do 2º fator ser verificado) nunca
  // pode ser aceito aqui como sessão completa. Ver auth.service.ts
  // (mfaPendingSecret) para a primeira camada de defesa — esta é a segunda.
  it('rejects any payload carrying a `scope` claim, even if validly signed', async () => {
    const { strategy } = buildStrategy();
    const pendingPayload = {
      ...payload,
      role: undefined as unknown as string,
      scope: 'mfa_pending',
    };

    await expect(strategy.validate(pendingPayload)).rejects.toThrow(UnauthorizedException);
  });

  // CC-018 — o token assinado e dentro do exp de um médico eliminado (LGPD)
  // não abre mais sessão.
  it('rejects a valid token of an erased physician', async () => {
    const { strategy } = buildStrategy(['physician-1']);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('keeps accepting other physicians when someone else was erased', async () => {
    const { strategy } = buildStrategy(['physician-2']);

    await expect(strategy.validate(payload)).resolves.toMatchObject({
      physicianId: 'physician-1',
    });
  });
});
