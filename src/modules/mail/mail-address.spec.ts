import { describe, expect, it } from 'vitest';
import { isValidMailAddress, maskMailAddress, parseMailbox } from './mail-address';

describe('maskMailAddress', () => {
  it('keeps only the first letters and the domain suffix', () => {
    expect(maskMailAddress('rodrigo@strivium.com.br')).toBe('r***@s***.com.br');
    expect(maskMailAddress('mentor@gmail.com')).toBe('m***@g***.com');
    expect(maskMailAddress('  ana@hospital.org  ')).toBe('a***@h***.org');
  });

  it('never returns the local part or the first domain label in full', () => {
    const masked = maskMailAddress('dra.fulana.silva@clinicafulana.com.br');

    expect(masked).not.toContain('fulana');
    expect(masked).not.toContain('silva');
    expect(masked).toBe('d***@c***.com.br');
  });

  it('does not split a character outside the BMP', () => {
    expect(maskMailAddress('𝒜lice@x.com')).toBe('𝒜***@x***.com');
  });

  it('collapses anything that is not an address to ***', () => {
    expect(maskMailAddress('')).toBe('***');
    expect(maskMailAddress('sem-arroba')).toBe('***');
    expect(maskMailAddress('@dominio.com')).toBe('***');
    expect(maskMailAddress('fulano@')).toBe('***');
  });
});

describe('isValidMailAddress', () => {
  it('accepts a plain single address', () => {
    expect(isValidMailAddress('medico@hospital.com.br')).toBe(true);
    expect(isValidMailAddress('a.b+tag@sub.dominio.org')).toBe(true);
  });

  it('refuses lists, display names, comments and header injection', () => {
    for (const address of [
      'a@x.com,b@y.com',
      'a@x.com; b@y.com',
      'Fulano <a@x.com>',
      '"a"@x.com',
      'a(comentario)@x.com',
      'a@x.com\r\nBcc: b@y.com',
      'a b@x.com',
      'a@localhost',
      'a@x.',
      'semarroba.com',
    ]) {
      expect(isValidMailAddress(address), address).toBe(false);
    }
  });

  it('refuses an address longer than 254 characters', () => {
    expect(isValidMailAddress(`${'a'.repeat(250)}@x.com`)).toBe(false);
  });
});

describe('parseMailbox', () => {
  it('reads "Name <address>" and a bare address', () => {
    expect(parseMailbox('Copiloto Clínico <nao-responda@copiloto.com.br>')).toEqual({
      name: 'Copiloto Clínico',
      address: 'nao-responda@copiloto.com.br',
    });
    expect(parseMailbox('"Copiloto" <nao-responda@copiloto.com.br>')).toEqual({
      name: 'Copiloto',
      address: 'nao-responda@copiloto.com.br',
    });
    expect(parseMailbox(' nao-responda@copiloto.com.br ')).toEqual({
      name: '',
      address: 'nao-responda@copiloto.com.br',
    });
  });

  it('returns null for an invalid sender', () => {
    expect(parseMailbox('')).toBeNull();
    expect(parseMailbox('Copiloto')).toBeNull();
    expect(parseMailbox('Copiloto <sem-arroba>')).toBeNull();
    expect(parseMailbox('Copiloto <a@x.com>, Outro <b@y.com>')).toBeNull();
  });
});
