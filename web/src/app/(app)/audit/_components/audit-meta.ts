import {
  ArrowsClockwise,
  BookOpen,
  Buildings,
  ChatCircleDots,
  FileText,
  FlowArrow,
  Handshake,
  IdentificationCard,
  Key,
  Microphone,
  Paperclip,
  PencilSimple,
  Plus,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  SignIn,
  SignOut,
  Sparkle,
  ThumbsUp,
  Trash,
  UserCircle,
  type Icon,
} from '@phosphor-icons/react';

/**
 * Rótulos legíveis da trilha de auditoria. Os códigos vêm do backend
 * (AuditService.log em src/modules/**) — código desconhecido cai no
 * fallback humanizado, e o código cru continua visível no detalhe do evento.
 *
 * Cor só com significado clínico/segurança (docs/design-system.md):
 * verde = conduta assinada, azul = IA, vermelho = falha de segurança.
 */
type ActionTone = 'green' | 'blue' | 'red' | 'gray';

export interface ActionMeta {
  label: string;
  icon: Icon;
  tone: ActionTone;
}

export const ACTION_TONE_CLASS: Record<ActionTone, string> = {
  green: 'text-tone-green',
  blue: 'text-tone-blue',
  red: 'text-tone-red',
  gray: 'text-muted-foreground',
};

const ACTION_META: Record<string, ActionMeta> = {
  DOCUMENT_CONFIRMED: { label: 'Documento confirmado e assinado', icon: SealCheck, tone: 'green' },
  DOCUMENT_GENERATED: { label: 'Documento gerado pela IA', icon: FileText, tone: 'blue' },
  DOCUMENT_EDITED: { label: 'Documento editado pelo médico', icon: PencilSimple, tone: 'gray' },
  SECTION_EDITED: { label: 'Seção editada pelo médico', icon: PencilSimple, tone: 'gray' },
  COPILOT_ANALYSIS: { label: 'Análise do copiloto', icon: Sparkle, tone: 'blue' },
  COPILOT_ANALYSIS_REFINED: { label: 'Análise refinada', icon: Sparkle, tone: 'blue' },
  COPILOT_QUESTIONS_EMITTED: { label: 'Perguntas do copiloto', icon: ChatCircleDots, tone: 'blue' },
  COPILOT_QUESTION_ANSWERED: { label: 'Pergunta respondida', icon: ChatCircleDots, tone: 'gray' },
  COPILOT_FEEDBACK: { label: 'Feedback sobre a análise', icon: ThumbsUp, tone: 'gray' },
  PII_REDACTED: { label: 'PII redigida antes do envio à IA', icon: ShieldCheck, tone: 'gray' },
  PROMPT_INJECTION_DETECTED: { label: 'Prompt injection bloqueado', icon: ShieldWarning, tone: 'red' },
  ENCOUNTER_CREATED: { label: 'Caso criado', icon: Plus, tone: 'gray' },
  ENCOUNTER_UPDATED: { label: 'Caso atualizado', icon: PencilSimple, tone: 'gray' },
  ENCOUNTER_ATTACHMENT_ADDED: { label: 'Anexo adicionado', icon: Paperclip, tone: 'gray' },
  ENCOUNTER_ATTACHMENT_REMOVED: { label: 'Anexo removido', icon: Paperclip, tone: 'gray' },
  AUDIO_UPLOAD: { label: 'Áudio enviado', icon: Microphone, tone: 'gray' },
  AUDIO_TRANSCRIBE: { label: 'Áudio transcrito', icon: Microphone, tone: 'gray' },
  AUDIO_PIPELINE_QUEUED: { label: 'Áudio na fila de transcrição', icon: Microphone, tone: 'gray' },
  AUTH_LOGIN: { label: 'Login', icon: SignIn, tone: 'gray' },
  LOGIN: { label: 'Login', icon: SignIn, tone: 'gray' },
  AUTH_LOGIN_FAILED: { label: 'Falha de login', icon: ShieldWarning, tone: 'red' },
  AUTH_LOGIN_MFA_REQUIRED: { label: 'Login aguardando MFA', icon: Key, tone: 'gray' },
  AUTH_LOGOUT: { label: 'Logout', icon: SignOut, tone: 'gray' },
  AUTH_REGISTER: { label: 'Cadastro de médico', icon: UserCircle, tone: 'gray' },
  AUTH_TOKEN_REFRESH: { label: 'Sessão renovada', icon: ArrowsClockwise, tone: 'gray' },
  AUTH_MFA_SETUP: { label: 'MFA em configuração', icon: Key, tone: 'gray' },
  AUTH_MFA_ENABLED: { label: 'MFA ativado', icon: Key, tone: 'gray' },
  AUTH_MFA_DISABLED: { label: 'MFA desativado', icon: Key, tone: 'gray' },
  AUTH_MFA_FAILED: { label: 'Falha no código MFA', icon: ShieldWarning, tone: 'red' },
  AUTH_MFA_BACKUPS_REGENERATED: { label: 'Códigos de backup do MFA gerados', icon: Key, tone: 'gray' },
  AUTH_MFA_ADMIN_RESET: { label: 'MFA redefinido por admin', icon: Key, tone: 'gray' },
  AUTH_MFA_ADMIN_BULK_RESET: { label: 'MFA redefinido em lote', icon: Key, tone: 'gray' },
  PASSWORD_CHANGED: { label: 'Senha alterada', icon: Key, tone: 'gray' },
  SESSION_REVOKED: { label: 'Sessão revogada', icon: SignOut, tone: 'gray' },
  PROFILE_UPDATED: { label: 'Perfil atualizado', icon: UserCircle, tone: 'gray' },
  CONSENT_GRANTED: { label: 'Consentimento concedido', icon: Handshake, tone: 'gray' },
  CONSENT_REVOKED: { label: 'Consentimento revogado', icon: Handshake, tone: 'gray' },
  DATA_ERASURE: { label: 'Exclusão de dados (LGPD)', icon: Trash, tone: 'gray' },
  CRM_VERIFICATION_REQUESTED: { label: 'Verificação de CRM solicitada', icon: IdentificationCard, tone: 'gray' },
  CRM_VERIFICATION_APPROVED: { label: 'CRM aprovado', icon: IdentificationCard, tone: 'gray' },
  CRM_VERIFICATION_REJECTED: { label: 'CRM rejeitado', icon: IdentificationCard, tone: 'gray' },
  GUIDELINE_INGESTED: { label: 'Diretriz ingerida', icon: BookOpen, tone: 'gray' },
  GUIDELINE_BATCH_INGESTED: { label: 'Lote de diretrizes ingerido', icon: BookOpen, tone: 'gray' },
  GUIDELINE_APPROVED: { label: 'Diretriz aprovada', icon: BookOpen, tone: 'gray' },
  GUIDELINE_REJECTED: { label: 'Diretriz rejeitada', icon: BookOpen, tone: 'gray' },
  GUIDELINE_DEACTIVATED: { label: 'Diretriz desativada', icon: BookOpen, tone: 'gray' },
  GUIDELINE_SUGGESTED: { label: 'Diretriz sugerida', icon: BookOpen, tone: 'gray' },
  OFFICIAL_GUIDELINE_SYNCED: { label: 'Base oficial sincronizada', icon: BookOpen, tone: 'gray' },
  PROTOCOL_CREATED: { label: 'Protocolo criado', icon: FlowArrow, tone: 'gray' },
  PROTOCOL_PUBLISHED: { label: 'Protocolo publicado', icon: FlowArrow, tone: 'gray' },
  PROTOCOL_REVISED: { label: 'Protocolo revisado', icon: FlowArrow, tone: 'gray' },
  PROTOCOL_RUN_STARTED: { label: 'Protocolo iniciado', icon: FlowArrow, tone: 'gray' },
  PROTOCOL_STEP: { label: 'Etapa de protocolo', icon: FlowArrow, tone: 'gray' },
  PROTOCOL_RUN_COMPLETED: { label: 'Protocolo concluído', icon: FlowArrow, tone: 'gray' },
  PROTOCOL_RUN_ABANDONED: { label: 'Protocolo abandonado', icon: FlowArrow, tone: 'gray' },
  INSTITUTION_CREATED: { label: 'Instituição criada', icon: Buildings, tone: 'gray' },
  PHYSICIAN_LINKED_TO_INSTITUTION: { label: 'Médico vinculado à instituição', icon: Buildings, tone: 'gray' },
};

function humanize(code: string): string {
  const text = code.toLowerCase().replace(/[_\s]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : code;
}

export function getActionMeta(action: string): ActionMeta {
  const key = action.toUpperCase().replace(/ /g, '_');
  return ACTION_META[key] ?? { label: humanize(action), icon: FileText, tone: 'gray' };
}

/** Entidade = categoria sem peso clínico → tag de cor de categoria. */
type EntityTone = 'purple' | 'brown' | 'pink' | 'yellow' | 'blue' | 'gray';

export interface EntityOption {
  value: string;
  label: string;
  tone: EntityTone;
}

/** Valores exatos gravados em audit_log.entity (o filtro do backend é por igualdade). */
export const ENTITY_OPTIONS: EntityOption[] = [
  { value: 'Document', label: 'Documento', tone: 'purple' },
  { value: 'Encounter', label: 'Caso', tone: 'brown' },
  { value: 'AiInteraction', label: 'Análise de IA', tone: 'blue' },
  { value: 'Physician', label: 'Médico', tone: 'pink' },
  { value: 'CrmVerificationRequest', label: 'Verificação de CRM', tone: 'yellow' },
  { value: 'Consent', label: 'Consentimento', tone: 'yellow' },
  { value: 'AudioCapture', label: 'Áudio', tone: 'brown' },
  { value: 'EncounterAttachment', label: 'Anexo', tone: 'brown' },
  { value: 'Protocol', label: 'Protocolo', tone: 'pink' },
  { value: 'ProtocolRun', label: 'Execução de protocolo', tone: 'pink' },
  { value: 'GuidelineChunk', label: 'Diretriz', tone: 'purple' },
  { value: 'OfficialGuidelineDocument', label: 'Diretriz oficial', tone: 'purple' },
  { value: 'Institution', label: 'Instituição', tone: 'gray' },
  { value: 'PhysicianInstitution', label: 'Vínculo institucional', tone: 'gray' },
  { value: 'RefreshToken', label: 'Sessão', tone: 'gray' },
];

/** "AiInteraction", "ai_interaction" e "aiinteraction" são a mesma entidade. */
function normalizeEntity(entity: string): string {
  return entity.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getEntityMeta(entity: string): EntityOption {
  const key = normalizeEntity(entity);
  return (
    ENTITY_OPTIONS.find((option) => normalizeEntity(option.value) === key) ?? {
      value: entity,
      label: entity,
      tone: 'gray',
    }
  );
}
