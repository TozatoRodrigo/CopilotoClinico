import type { Physician } from '@prisma/client';

/**
 * CC-012 — o que a eliminação (LGPD Art. 18, VI) faz com cada dado do médico.
 *
 * O cadastro não é apagado: fica anonimizado como referente do `actor_id` da
 * trilha de auditoria, que é append-only e registro de obrigação legal
 * (Art. 16, I). O que aponta para o médico é apagado ou perde o vínculo, salvo
 * as exceções justificadas abaixo.
 *
 * O teste de inventário (erasure-policy.spec.ts) lê o schema do Prisma e falha
 * quando aparece coluna que aponta para o médico — `physician_id`, `user_id`
 * ou FK para `physicians` — fora da política e das exceções. Tabela nova
 * obriga a decidir aqui; o teste de integração (CC-012) confere a decisão no
 * banco.
 */

/** `tabela.coluna` como no banco (o `@@map`/`@map` do schema). */
export type PhysicianReference = `${string}.${string}`;

export interface ErasureDecision {
  /**
   * `delete`: as linhas do médico são apagadas.
   * `anonymize`: as linhas ficam, sem o vínculo com o médico.
   * Nos dois casos, depois da eliminação nenhuma linha aponta para o médico
   * por esta coluna.
   */
  action: 'delete' | 'anonymize';
  reason: string;
}

export const ERASURE_POLICY = {
  'encounters.physician_id': {
    action: 'delete',
    reason:
      'Atendimentos do médico. A cascata leva interações de IA, documentos, conversas guiadas e execuções de protocolo.',
  },
  'encounter_attachments.physician_id': {
    action: 'delete',
    reason: 'Texto (já mascarado) das referências que o médico anexou aos atendimentos.',
  },
  'audio_captures.physician_id': {
    action: 'delete',
    reason: 'Áudio cifrado e transcrição dos atendimentos.',
  },
  'documents.physician_id': {
    action: 'delete',
    reason: 'Documentos dos atendimentos; o PDF sai do storage antes da transação.',
  },
  'case_intakes.physician_id': {
    action: 'delete',
    reason: 'Conversa antes do plano (ADR-014); sai na cascata do atendimento.',
  },
  'recommendation_decisions.physician_id': {
    action: 'delete',
    reason: 'Adotar/Rejeitar/Anotar por recomendação (F0-D).',
  },
  'copilot_feedback.physician_id': {
    action: 'delete',
    reason:
      'Fila de triagem. O registro médico-legal do reporte fica na trilha (COPILOT_FEEDBACK).',
  },
  'consents.physician_id': {
    action: 'delete',
    reason:
      'A prova do consentimento (Art. 8º, § 2º) fica na trilha: CONSENT_GRANTED e CONSENT_REVOKED.',
  },
  'refresh_tokens.physician_id': {
    action: 'delete',
    reason: 'Sessões: apagar encerra todas.',
  },
  'mfa_backup_codes.physician_id': {
    action: 'delete',
    reason: 'Credencial (hash dos códigos de recuperação), sem valor de auditoria.',
  },
  'crm_verification_requests.physician_id': {
    action: 'delete',
    reason:
      'Fila do console admin, com `notes` em texto livre. Quem pediu, quem aprovou ou recusou e quando já estão na trilha (CRM_VERIFICATION_*), com o id do pedido.',
  },
  'physician_institutions.physician_id': {
    action: 'delete',
    reason:
      'Onde o médico trabalha. O vínculo e a data ficam na trilha (PHYSICIAN_LINKED_TO_INSTITUTION).',
  },
  'login_security_states.physician_id': {
    action: 'delete',
    reason:
      'Contador do bloqueio por tentativas, que vale minutos. A chave é o SHA-256 sem sal do e-mail, reidentificável: sai também a linha sem physician_id que tem o hash do e-mail.',
  },
  'ai_calls.physician_id': {
    action: 'anonymize',
    reason:
      'Só metadados (etapa, modelo, tokens, custo, latência). O custo agregado fica; physician_id, encounter_id e request_id viram NULL.',
  },
} as const satisfies Record<PhysicianReference, ErasureDecision>;

/**
 * Colunas que continuam apontando para o cadastro anonimizado depois da
 * eliminação, cada uma com o porquê — por exemplo, um registro que é de outra
 * pessoa e precisa saber quem o fez. Hoje nenhuma.
 */
export const ERASURE_EXCEPTIONS = {} as const satisfies Record<PhysicianReference, string>;

/**
 * Colunas do cadastro que a anonimização mantém, e por quê. Toda outra coluna
 * de `Physician` precisa de valor em `anonymizedPhysician`: coluna nova no
 * cadastro não compila até alguém decidir.
 */
export const PHYSICIAN_KEPT_COLUMNS = {
  id: 'Referente pseudônimo do actor_id da trilha e das colunas de autoria (reviewed_by, triaged_by, created_by).',
  role: 'Papel na plataforma, não identifica; explica na trilha as ações administrativas feitas com este id.',
  isCurator: 'Idem: proveniência da curadoria (guideline_chunks.reviewed_by).',
  subscriptionStatus: 'Estado comercial da conta, não identifica.',
  createdAt: 'Data de criação da conta, não identifica.',
  updatedAt: 'Mantida pelo Prisma: passa a ser a data da eliminação.',
} as const satisfies Partial<Record<keyof Physician, string>>;

type AnonymizedPhysicianColumn = Exclude<keyof Physician, keyof typeof PHYSICIAN_KEPT_COLUMNS>;

/** Valores que substituem o cadastro do médico na eliminação. */
export function anonymizedPhysician(physicianId: string): {
  [Column in AnonymizedPhysicianColumn]: Physician[Column];
} {
  return {
    name: 'ERASED',
    email: `erased-${physicianId}@erased.com`,
    // Não é hash bcrypt: nenhuma senha confere.
    passwordHash: `erased:${physicianId}`,
    // UF + número identificam o médico no cadastro público do CFM.
    crmUf: 'XX',
    crmNumber: 'ERASED',
    crmVerified: false,
    // Segredo TOTP (cifrado): credencial, sem valor de auditoria.
    mfaEnabled: false,
    mfaSecret: null,
    locale: 'pt-BR',
  };
}
