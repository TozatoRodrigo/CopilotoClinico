/**
 * CC-409 — eventos da trilha de auditoria (ADR-002/015) na fila de lacunas.
 * O grupo não guarda quem o tratou ("lacunas não têm médico"); a trilha
 * guarda, com o curador como ator. Motivo de descarte só como hash.
 */
export const KNOWLEDGE_GAP_AUDIT_ACTIONS = {
  draftRequested: 'KNOWLEDGE_GAP_DRAFT_REQUESTED',
  dismissed: 'KNOWLEDGE_GAP_DISMISSED',
  reopened: 'KNOWLEDGE_GAP_REOPENED',
  covered: 'KNOWLEDGE_GAP_COVERED',
} as const;

export const KNOWLEDGE_GAP_AUDIT_ENTITY = 'KnowledgeGapGroup';
