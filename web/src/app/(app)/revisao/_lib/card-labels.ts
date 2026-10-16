import type { KnowledgeCardClaimKind } from '@contracts/knowledge-cards';

/** CC-404 — rótulos do cartão na ordem do CC-402 (o que fazer agora primeiro). */
export const CLAIM_KIND_LABEL: Record<KnowledgeCardClaimKind, string> = {
  conduct: 'O que fazer agora',
  criterion: 'Critério',
  alarm_sign: 'Sinal de alarme',
  disposition: 'Internação ou transferência',
  notification: 'Notificação',
  pitfall: 'Armadilha',
};

export const CLAIM_KIND_ORDER: readonly KnowledgeCardClaimKind[] = [
  'conduct',
  'criterion',
  'alarm_sign',
  'disposition',
  'notification',
  'pitfall',
];

/** Validade da aprovação oferecida na tela, em meses (a API aceita de 1 a 36; padrão 12). */
export const VALIDITY_OPTIONS = [6, 12, 24, 36] as const;
export const DEFAULT_VALIDITY_MONTHS = 12;

/** Motivos frequentes de descarte; o revisor pode editar o texto. */
export const REJECT_REASONS = [
  'Dose errada ou sem fonte',
  'A fonte não sustenta a afirmação',
  'Fora do escopo do pronto-socorro',
  'Duplica outro cartão',
] as const;
