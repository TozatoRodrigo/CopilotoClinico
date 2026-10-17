import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { protocolAuthority } from './protocol-authoring';

describe('protocolAuthority (CC-020)', () => {
  it('curador escreve, com qualquer papel', () => {
    expect(protocolAuthority({ role: Role.PHYSICIAN, isCurator: true })).toBe('curator');
    expect(protocolAuthority({ role: Role.COMPLIANCE, isCurator: true })).toBe('curator');
    expect(protocolAuthority({ role: Role.ADMIN, isCurator: true })).toBe('curator');
  });

  it('ADMIN escreve sem ser curador', () => {
    expect(protocolAuthority({ role: Role.ADMIN, isCurator: false })).toBe('admin');
  });

  it('médico e COMPLIANCE sem a flag de curador não escrevem', () => {
    expect(protocolAuthority({ role: Role.PHYSICIAN, isCurator: false })).toBeNull();
    expect(protocolAuthority({ role: Role.COMPLIANCE, isCurator: false })).toBeNull();
  });

  it('médico que não existe mais não escreve', () => {
    expect(protocolAuthority(null)).toBeNull();
  });
});
