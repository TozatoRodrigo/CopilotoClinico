import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { loginIdentifierHash } from './login-identifier';

describe('loginIdentifierHash', () => {
  // O login grava e a eliminação LGPD apaga pela mesma chave: e-mail digitado
  // com espaço ou em outra caixa precisa cair na mesma linha.
  it('hashes the trimmed, lower-cased e-mail', () => {
    const expected = createHash('sha256').update('dra.ana@hospital.com').digest('hex');

    expect(loginIdentifierHash('  Dra.Ana@Hospital.com ')).toBe(expected);
    expect(loginIdentifierHash('dra.ana@hospital.com')).toBe(expected);
  });
});
