import type { MentoringRequestStatus } from '../../shared/contracts/clinical';

/**
 * CC-707 — a máquina de estados do pedido de mentoria, sem banco nem HTTP.
 *
 *   pending ──claim──▶ claimed ──answer──▶ answered ──rate──▶ (answered, com nota)
 *      ▲  └────────answer────────────────────▲
 *      └──release── claimed
 *   pending | claimed ──cancel──▶ cancelled
 *
 * Responder direto de `pending` assume o pedido no mesmo passo: com três
 * mentores, exigir "assumir" antes só atrasaria quem já leu o caso. Assumir
 * existe para os outros verem que alguém está com ele.
 *
 * Quem pode o quê:
 * - assumir, devolver e responder: mentor (o guard confere a flag); nunca o
 *   próprio pedido; pedido assumido só pelo mentor que assumiu;
 * - cancelar e avaliar: só quem pediu.
 */

export type MentoringAction = 'claim' | 'release' | 'answer' | 'cancel' | 'rate';

export interface MentoringRequestState {
  status: MentoringRequestStatus;
  requesterId: string;
  mentorId: string | null;
  satisfaction: number | null;
}

export type MentoringTransitionRefusal =
  /** A ação é de quem pediu, e quem tentou não pediu. */
  | 'not_requester'
  /** Mentor tentando assumir ou responder o próprio pedido. */
  | 'own_request'
  /** Outro mentor já assumiu. */
  | 'claimed_by_other'
  /** O pedido não está num estado que aceite a ação. */
  | 'invalid_state'
  | 'already_rated';

export type MentoringTransition =
  | { ok: true; status: MentoringRequestStatus; mentorId: string | null }
  | { ok: false; refusal: MentoringTransitionRefusal };

const OPEN_STATUSES: readonly MentoringRequestStatus[] = ['pending', 'claimed'];

export function isOpenStatus(status: MentoringRequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

function refuse(refusal: MentoringTransitionRefusal): MentoringTransition {
  return { ok: false, refusal };
}

function mentorTakes(
  state: MentoringRequestState,
  actorId: string,
  next: MentoringRequestStatus,
): MentoringTransition {
  if (state.requesterId === actorId) return refuse('own_request');
  if (state.status === 'pending') return { ok: true, status: next, mentorId: actorId };
  if (state.status === 'claimed') {
    return state.mentorId === actorId
      ? { ok: true, status: next, mentorId: actorId }
      : refuse('claimed_by_other');
  }
  return refuse('invalid_state');
}

export function planMentoringTransition(
  state: MentoringRequestState,
  action: MentoringAction,
  actorId: string,
): MentoringTransition {
  switch (action) {
    case 'claim':
      return mentorTakes(state, actorId, 'claimed');
    case 'answer':
      return mentorTakes(state, actorId, 'answered');
    case 'release':
      if (state.status !== 'claimed') return refuse('invalid_state');
      return state.mentorId === actorId
        ? { ok: true, status: 'pending', mentorId: null }
        : refuse('claimed_by_other');
    case 'cancel':
      if (state.requesterId !== actorId) return refuse('not_requester');
      return isOpenStatus(state.status)
        ? { ok: true, status: 'cancelled', mentorId: state.mentorId }
        : refuse('invalid_state');
    case 'rate':
      if (state.requesterId !== actorId) return refuse('not_requester');
      if (state.status !== 'answered') return refuse('invalid_state');
      if (state.satisfaction !== null) return refuse('already_rated');
      return { ok: true, status: 'answered', mentorId: state.mentorId };
  }
}
