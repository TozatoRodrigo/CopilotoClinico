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
  'external_identities.physician_id': {
    action: 'delete',
    reason:
      'Contas Google/Microsoft vinculadas (CC-334), com o e-mail do vínculo. Sem apagar, o login social entraria na conta anonimizada.',
  },
  'legal_acceptances.physician_id': {
    action: 'delete',
    reason:
      'Aceites dos termos e da política (CC-905). O evento do aceite fica na trilha (LEGAL_DOCUMENT_ACCEPTED).',
  },
  'mentoring_requests.requester_id': {
    action: 'delete',
    reason: 'Pedidos de mentoria que o médico fez (CC-707), com caso e dúvida já mascarados.',
  },
  'practice_sites.physician_id': {
    action: 'delete',
    reason: 'Onde o médico dá plantão (CC-602): local e porte ajudam a reidentificá-lo.',
  },
  'shift_reviews.physician_id': {
    action: 'delete',
    reason:
      'Revisões do plantão (CC-801). Não pendem do atendimento: sem apagar, ficariam no cadastro anonimizado.',
  },
  'shift_review_questions.physician_id': {
    action: 'delete',
    reason: 'Perguntas e respostas da revisão do plantão, com o grau de certeza do médico.',
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
 * pessoa e precisa saber quem o fez. O cadastro anonimizado não tem nome,
 * e-mail nem CRM: o id é um pseudônimo.
 */
export const ERASURE_EXCEPTIONS = {
  'beta_participants.physician_id':
    'Participação no beta (CC-702): termo e perfil são apagados e ficam os ids e a data de entrada, para a contagem do lote de convite.',
  'mentoring_requests.mentor_id':
    'A resposta que o médico deu como mentor é parte do caso de quem pediu (CC-707) e fica com ele; o mentor vira o cadastro anonimizado.',
  'knowledge_card_versions.author_physician_id':
    'Autoria de versão de cartão clínico (ADR-019), conteúdo que outros médicos usam. Um trigger impede regravar a versão e a role da API não a apaga; a FK é RESTRICT.',
  'knowledge_card_versions.reviewer_id':
    'Idem: quem aprovou o cartão. A decisão do revisor não pode ser regravada (trigger) e é a proveniência do conteúdo publicado.',
  'knowledge_card_cross_reviews.reviewer_id':
    'Revisão cruzada de 10% (CC-411): a decisão do segundo médico é congelada por trigger, a role da API não a apaga e a FK é RESTRICT. É a proveniência do conteúdo publicado.',
  'knowledge_card_cross_reviews.first_reviewer_id':
    'Idem: o primeiro revisor da versão sorteada, copiado para garantir que o segundo médico seja outra pessoa.',
  'knowledge_card_cross_reviews.version_author_id':
    'Idem: o autor da versão sorteada, copiado para garantir que o segundo médico não revise o próprio cartão.',
} as const satisfies Record<PhysicianReference, string>;

/**
 * Colunas do cadastro que a anonimização mantém, e por quê. Toda outra coluna
 * de `Physician` precisa de valor em `anonymizedPhysician`: coluna nova no
 * cadastro não compila até alguém decidir.
 */
export const PHYSICIAN_KEPT_COLUMNS = {
  id: 'Referente pseudônimo do actor_id da trilha e das colunas de autoria (reviewed_by, triaged_by, created_by).',
  role: 'Papel na plataforma, não identifica; explica na trilha as ações administrativas feitas com este id.',
  isCurator: 'Idem: proveniência da curadoria (guideline_chunks.reviewed_by).',
  isMentor:
    'Idem: proveniência das respostas de mentoria que ficam no caso de quem pediu (mentoring_requests.mentor_id). Sem sessão, a conta eliminada não responde mais.',
  isCardReviewer:
    'Idem: proveniência das revisões de cartão (knowledge_card_versions.reviewer_id e knowledge_card_cross_reviews.reviewer_id). Sem sessão, a conta eliminada não revisa mais.',
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
    // CC-014 — a especialidade, com o CRM, ajuda a reidentificar.
    specialty: null,
    // CC-018 — não é dado do médico: a marca da eliminação. A estratégia JWT e
    // o refresh recusam a sessão por aqui.
    erasedAt: new Date(),
  };
}
