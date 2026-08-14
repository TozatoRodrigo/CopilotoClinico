import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  });
  const strategy = new JwtStrategy(config);

  it('returns the user context for a normal session payload', () => {
    const payload = {
      sub: 'physician-1',
      email: 'doctor@example.com',
      physicianId: 'physician-1',
      role: 'PHYSICIAN',
    };

    expect(strategy.validate(payload)).toEqual({
      sub: 'physician-1',
      email: 'doctor@example.com',
      physicianId: 'physician-1',
      role: 'PHYSICIAN',
    });
  });

  // SEC-01 — regression: um token de propósito restrito (ex.: mfa_pending,
  // emitido após senha correta mas ANTES do 2º fator ser verificado) nunca
  // pode ser aceito aqui como sessão completa. Ver auth.service.ts
  // (mfaPendingSecret) para a primeira camada de defesa — esta é a segunda.
  it('rejects any payload carrying a `scope` claim, even if validly signed', () => {
    const pendingPayload = {
      sub: 'physician-1',
      email: 'doctor@example.com',
      physicianId: 'physician-1',
      role: undefined as unknown as string,
      scope: 'mfa_pending',
    };

    expect(() => strategy.validate(pendingPayload)).toThrow(UnauthorizedException);
  });
});
