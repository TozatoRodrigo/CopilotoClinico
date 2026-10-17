import type {
  KnowledgeCardDisplayStatus,
  KnowledgeCardStatus,
} from '../../../shared/contracts/knowledge-cards';

/**
 * CC-402 — ciclo de vida do cartão (ADR-019):
 *
 *   rascunho ──enviar──▶ em revisão ──aprovar──▶ publicado ──arquivar──▶ arquivado
 *                         │  ▲                      │
 *                rejeitar │  └──── corrigir ────────┘
 *                         ▼
 *     arquivado (sem versão publicada) ou publicado (correção recusada)
 *
 * Corrigir cria versão nova e nunca derruba a versão publicada: ela segue
 * valendo até outra ser aprovada. Arquivado é final.
 *
 * CC-411 — a exceção é a revisão cruzada que diverge (`reopen`): o segundo
 * médico discorda da versão publicada, a correção dele vira versão nova e o
 * cartão sai do ar e volta para "em revisão" sem versão publicada.
 */

export const KNOWLEDGE_CARD_ACTIONS = [
  'submit',
  'approve',
  'reject',
  'archive',
  'edit',
  'reopen',
] as const;
export type KnowledgeCardAction = (typeof KNOWLEDGE_CARD_ACTIONS)[number];

export interface KnowledgeCardState {
  status: KnowledgeCardStatus;
  /** Já houve uma versão aprovada (`published_version_id` preenchido). */
  hasPublishedVersion: boolean;
}

export type TransitionResult =
  | { ok: true; to: KnowledgeCardStatus }
  | { ok: false; reason: string };

const ACTION_LABEL: Record<KnowledgeCardAction, string> = {
  submit: 'enviar para revisão',
  approve: 'aprovar',
  reject: 'rejeitar',
  archive: 'arquivar',
  edit: 'corrigir',
  reopen: 'reabrir pela revisão cruzada',
};

const STATUS_LABEL: Record<KnowledgeCardStatus, string> = {
  draft: 'rascunho',
  in_review: 'em revisão',
  published: 'publicado',
  archived: 'arquivado',
};

function refuse(action: KnowledgeCardAction, status: KnowledgeCardStatus): TransitionResult {
  return {
    ok: false,
    reason: `não é possível ${ACTION_LABEL[action]} um cartão ${STATUS_LABEL[status]}`,
  };
}

/** Para onde a ação leva o cartão, ou por que ela não vale no status atual. */
export function transition(
  state: KnowledgeCardState,
  action: KnowledgeCardAction,
): TransitionResult {
  const { status } = state;
  switch (action) {
    case 'submit':
      return status === 'draft' ? { ok: true, to: 'in_review' } : refuse(action, status);
    case 'approve':
      return status === 'in_review' ? { ok: true, to: 'published' } : refuse(action, status);
    case 'reject':
      // Correção recusada de um cartão já publicado: a versão assinada segue valendo.
      if (status !== 'in_review') return refuse(action, status);
      return { ok: true, to: state.hasPublishedVersion ? 'published' : 'archived' };
    case 'archive':
      return status === 'archived' ? refuse(action, status) : { ok: true, to: 'archived' };
    case 'edit':
      if (status === 'archived') return refuse(action, status);
      // Corrigir o publicado abre revisão da versão nova; rascunho segue rascunho.
      return { ok: true, to: status === 'published' ? 'in_review' : status };
    case 'reopen':
      return status === 'published' ? { ok: true, to: 'in_review' } : refuse(action, status);
  }
}

/** Validade da aprovação, em meses (CC-402: "validade"). */
export const DEFAULT_VALIDITY_MONTHS = 12;
export const MAX_VALIDITY_MONTHS = 36;

/** `reviewedAt` + meses, no calendário UTC; dia 31 cai no último dia do mês de destino. */
export function validUntilFrom(reviewedAt: Date, months: number): Date {
  const target = new Date(reviewedAt.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * CC-402, critério 3 — publicado com a aprovação vencida aparece como
 * "revisar" (`needs_review`). Vencida = `validUntil` no passado.
 */
export function displayStatus(
  card: { status: KnowledgeCardStatus; publishedValidUntil: Date | null },
  now: Date,
): KnowledgeCardDisplayStatus {
  if (
    card.status === 'published' &&
    card.publishedValidUntil !== null &&
    card.publishedValidUntil.getTime() < now.getTime()
  ) {
    return 'needs_review';
  }
  return card.status;
}
