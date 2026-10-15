/** Eventos da trilha de auditoria (ADR-002/015) nas transições do cartão (ADR-019). */
export const KNOWLEDGE_CARD_AUDIT_ACTIONS = {
  drafted: 'CARD_DRAFTED',
  versionCreated: 'CARD_VERSION_CREATED',
  submitted: 'CARD_SUBMITTED',
  approved: 'CARD_APPROVED',
  rejected: 'CARD_REJECTED',
  archived: 'CARD_ARCHIVED',
} as const;

export const KNOWLEDGE_CARD_AUDIT_ENTITY = 'KnowledgeCard';
