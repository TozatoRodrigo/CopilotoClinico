import { describe, expect, it } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';

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
