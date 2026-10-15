import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  normalizeInviteCode,
} from '../../shared/contracts/beta';
import { generateInviteCode, inviteProblem, inviteStatus } from './invite-code';

const now = new Date('2026-10-15T12:00:00.000Z');

function invite(overrides: Partial<Parameters<typeof inviteProblem>[0]> = {}) {
  return {
    maxUses: 1,
    usesCount: 0,
    expiresAt: new Date('2026-11-15T12:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

describe('código de convite (CC-702)', () => {
  it('generates codes of the fixed length using only the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect([...code].every((char) => INVITE_CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(INVITE_CODE_ALPHABET).not.toMatch(/[01ILOUV]/);
  });

  it('takes every symbol from the random source (nothing derived from the person)', () => {
    let calls = 0;
    const code = generateInviteCode((max) => {
      expect(max).toBe(INVITE_CODE_ALPHABET.length);
      return calls++ % max;
    });
    expect(code).toBe(INVITE_CODE_ALPHABET.slice(0, INVITE_CODE_LENGTH));
  });

  it('normalizes what the physician types and formats it back in two halves', () => {
    expect(normalizeInviteCode(' k3mq-9xpt ')).toBe('K3MQ9XPT');
    expect(normalizeInviteCode('k3mq 9xpt')).toBe('K3MQ9XPT');
    expect(formatInviteCode('k3mq9xpt')).toBe('K3MQ-9XPT');
    // Tamanho errado não é inventado: volta só normalizado.
    expect(formatInviteCode('abc')).toBe('ABC');
  });

  describe('inviteProblem', () => {
    it('accepts an active invite', () => {
      expect(inviteProblem(invite(), now)).toBeNull();
      expect(inviteStatus(invite(), now)).toBe('active');
    });

    it('refuses a single-use invite after its use', () => {
      expect(inviteProblem(invite({ usesCount: 1 }), now)).toBe('exhausted');
    });

    it('accepts a limited invite until the last use', () => {
      expect(inviteProblem(invite({ maxUses: 20, usesCount: 19 }), now)).toBeNull();
      expect(inviteProblem(invite({ maxUses: 20, usesCount: 20 }), now)).toBe('exhausted');
    });

    it('refuses an invite at the exact expiry instant', () => {
      expect(inviteProblem(invite({ expiresAt: now }), now)).toBe('expired');
      expect(inviteProblem(invite({ expiresAt: new Date(now.getTime() + 1) }), now)).toBeNull();
    });

    it('reports revocation first: it is the admin decision', () => {
      const everything = invite({ revokedAt: now, expiresAt: now, usesCount: 1 });
      expect(inviteProblem(everything, now)).toBe('revoked');
      expect(inviteStatus(everything, now)).toBe('revoked');
    });
  });
});
