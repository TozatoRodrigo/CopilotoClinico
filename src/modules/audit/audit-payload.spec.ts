import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { freeTextHash } from './audit-payload';

describe('freeTextHash', () => {
  it('devolve o SHA-256 do texto, nunca o texto', () => {
    const text = 'Paciente Maria Silva recusou a internação.';

    const hash = freeTextHash(text);

    expect(hash).toBe(createHash('sha256').update(text).digest('hex'));
    expect(hash).not.toContain('Maria');
  });

  it.each([null, undefined, ''])('texto ausente (%j) vira null', (text) => {
    expect(freeTextHash(text)).toBeNull();
  });
});
