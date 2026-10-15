import { randomInt } from 'crypto';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  type BetaInviteProblem,
  type BetaInviteStatus,
} from '../../shared/contracts/beta';

/** Fonte de aleatoriedade injetável nos testes; `randomInt` do crypto em produção. */
export type RandomIndex = (maxExclusive: number) => number;

/** Código novo, já normalizado. Aleatório: não deriva de nada da pessoa. */
export function generateInviteCode(random: RandomIndex = randomInt): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[random(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/** Os campos do convite que decidem se ele ainda serve. */
export interface InviteState {
  maxUses: number;
  usesCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** O que pode haver de errado com um convite que existe. */
export type ExistingInviteProblem = Exclude<BetaInviteProblem, 'not_found'>;

/**
 * Por que o convite não serve agora, ou `null` se serve. Revogação vem antes
 * da validade e do limite: é a decisão explícita do admin.
 */
export function inviteProblem(invite: InviteState, now: Date): ExistingInviteProblem | null {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.usesCount >= invite.maxUses) return 'exhausted';
  return null;
}

export function inviteStatus(invite: InviteState, now: Date): BetaInviteStatus {
  return inviteProblem(invite, now) ?? 'active';
}
