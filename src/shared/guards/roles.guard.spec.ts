import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

// PI-02 — acceptance criterion "Teste de RBAC (médico recebe 403/redirect)":
// este é o teste que faz cumprir isso a nível de API, não só de UI. Um
// médico comum tentando acessar /analytics/cost deve receber 403 mesmo que
// ele descubra a URL e chame a API diretamente.
function makeContext(requiredRoles: string[] | undefined, userRole: string | undefined) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : undefined }),
    }),
  } as unknown as ExecutionContext;

  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('allows access when the route declares no required roles', () => {
    const { guard, context } = makeContext(undefined, 'PHYSICIAN');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the route declares an empty roles array', () => {
    const { guard, context } = makeContext([], 'PHYSICIAN');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user role is in the required list', () => {
    const { guard, context } = makeContext(['ADMIN', 'COMPLIANCE'], 'ADMIN');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a second role in the required list (COMPLIANCE)', () => {
    const { guard, context } = makeContext(['ADMIN', 'COMPLIANCE'], 'COMPLIANCE');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a physician trying to reach an admin/compliance-only route (PI-02: /analytics/cost)', () => {
    const { guard, context } = makeContext(['ADMIN', 'COMPLIANCE'], 'PHYSICIAN');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user role at all', () => {
    const { guard, context } = makeContext(['ADMIN', 'COMPLIANCE'], undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('includes the required roles in the rejection message', () => {
    const { guard, context } = makeContext(['ADMIN', 'COMPLIANCE'], 'PHYSICIAN');
    expect(() => guard.canActivate(context)).toThrow(/ADMIN, COMPLIANCE/);
  });
});
