/** Eventos da trilha de auditoria (ADR-002/015) nas transições do cartão (ADR-019). */
export const KNOWLEDGE_CARD_AUDIT_ACTIONS = {
  drafted: 'CARD_DRAFTED',
  versionCreated: 'CARD_VERSION_CREATED',
  submitted: 'CARD_SUBMITTED',
  approved: 'CARD_APPROVED',
  rejected: 'CARD_REJECTED',
  archived: 'CARD_ARCHIVED',
  /** CC-411 — o segundo médico concordou com a versão sorteada. */
  crossReviewAgreed: 'CARD_CROSS_REVIEW_AGREED',
  /** CC-411 — divergiu: a correção virou versão nova e o cartão saiu do ar. */
  crossReviewDiverged: 'CARD_CROSS_REVIEW_DIVERGED',
} as const;

export const KNOWLEDGE_CARD_AUDIT_ENTITY = 'KnowledgeCard';
