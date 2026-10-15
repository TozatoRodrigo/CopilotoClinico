import type { PsSyndrome } from './clinical';

/**
 * CC-402 / CC-403 (ADR-019) — cartões revisados: uma situação clínica, com
 * pergunta e resposta curta, em que cada afirmação e cada dose citam um
 * trecho literal de uma diretriz já ingerida. A IA rascunha; um médico com
 * CRM verificado revisa e assina.
 *
 * Só tipos e listas de valores: o web importa este arquivo pelo alias
 * `@contracts/*` e não tem o zod. Os schemas que validam requisição e
 * conteúdo ficam no módulo (`knowledge-cards.schemas.ts`, `card-content.ts`)
 * e são conferidos contra estes tipos com `satisfies`.
 */

export const KNOWLEDGE_CARD_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type KnowledgeCardStatus = (typeof KNOWLEDGE_CARD_STATUSES)[number];

/**
 * O que a tela mostra. `needs_review` ("revisar") não é gravado: é o cartão
 * publicado cuja aprovação venceu (`validUntil` no passado).
 */
export const KNOWLEDGE_CARD_DISPLAY_STATUSES = [
  ...KNOWLEDGE_CARD_STATUSES,
  'needs_review',
] as const;
export type KnowledgeCardDisplayStatus = (typeof KNOWLEDGE_CARD_DISPLAY_STATUSES)[number];

/**
 * Tipos de afirmação, na ordem do cartão do CC-402: o que fazer agora (com
 * dose), critério, sinal de alarme, internação/transferência, notificação e
 * armadilha.
 */
export const KNOWLEDGE_CARD_CLAIM_KINDS = [
  'conduct',
  'criterion',
  'alarm_sign',
  'disposition',
  'notification',
  'pitfall',
] as const;
export type KnowledgeCardClaimKind = (typeof KNOWLEDGE_CARD_CLAIM_KINDS)[number];

/**
 * `import` (CC-405): a versão saiu do conteúdo tipado das ferramentas do ANY
 * por mapeamento determinístico, sem IA (`knowledge_card_imports`).
 */
export const KNOWLEDGE_CARD_AUTHOR_KINDS = ['ai', 'physician', 'import'] as const;
export type KnowledgeCardAuthorKind = (typeof KNOWLEDGE_CARD_AUTHOR_KINDS)[number];

export const KNOWLEDGE_CARD_REVIEW_DECISIONS = ['approved', 'rejected'] as const;
export type KnowledgeCardReviewDecision = (typeof KNOWLEDGE_CARD_REVIEW_DECISIONS)[number];

export const KNOWLEDGE_CARD_DRAFT_STATUSES = ['completed', 'failed'] as const;
export type KnowledgeCardDraftStatus = (typeof KNOWLEDGE_CARD_DRAFT_STATUSES)[number];

/** Trecho literal de uma fonte do cartão; `sourceKey` é a chave dela em `sources` ("S1"). */
export interface KnowledgeCardCitation {
  sourceKey: string;
  quote: string;
}

/**
 * Dose estruturada. Cada campo preenchido aparece, letra por letra, no trecho
 * citado em `citation` — é o que libera a dose no CC-408.
 */
export interface KnowledgeCardDose {
  drug: string;
  /** Quantidade e unidade como a fonte escreve ("2 g", "0,9 mg/kg"). */
  amount: string;
  route: string | null;
  frequency: string | null;
  maxDose: string | null;
  citation: KnowledgeCardCitation;
}

export interface KnowledgeCardClaim {
  kind: KnowledgeCardClaimKind;
  text: string;
  dose: KnowledgeCardDose | null;
  citations: KnowledgeCardCitation[];
}

/**
 * Fonte do cartão: um trecho de diretriz já ingerido (`guideline_chunks`).
 * Metadados resolvidos pelo servidor a partir do chunk, nunca enviados pelo
 * cliente; `chunkSha256` fixa o texto exato que as citações conferiram.
 *
 * Sem `kind`, para o conteúdo (e o hash) das versões gravadas antes da
 * CC-405 continuar o mesmo.
 */
export interface KnowledgeCardGuidelineSource {
  kind?: undefined;
  key: string;
  chunkId: string;
  /** Versão do documento oficial (ADR-010); `null` na base curada. */
  documentId: string | null;
  title: string;
  sourceVersion: string;
  section: string | null;
  url: string | null;
  chunkSha256: string;
}

/**
 * CC-405 — ferramentas do ANY cujo conteúdo vira cartão. O id é o da área
 * Ferramentas (`/ferramentas/<id>`) e o prefixo da chave do cartão importado.
 */
export const ANY_CARD_TOOL_IDS = [
  'infusoes',
  'pediatria',
  'via-aerea',
  'sedacao',
  'toxicologia',
  'bloqueios',
  'paliativos',
  'acls',
  'dengue',
  'cad-ehh',
] as const;
export type AnyCardToolId = (typeof ANY_CARD_TOOL_IDS)[number];

/**
 * CC-405 — fonte que é um item do motor clínico das Ferramentas
 * (`src/shared/clinical-tools`): a dose ou o protocolo do ANY por extenso,
 * com a referência original e a procedência que o motor guarda. O servidor
 * resolve tudo pelo `toolItemId` a partir do código; o cliente só manda a
 * chave e o id. `textSha256` fixa o texto que as citações conferiram: se o
 * dado do motor mudar, o texto muda e a versão também.
 */
export interface KnowledgeCardToolSource {
  kind: 'clinical_tool';
  key: string;
  /** "infusoes/noradrenalina" — ferramenta e item no motor. */
  toolItemId: string;
  /** A referência bibliográfica do ANY ou, sem ela, o nome da ferramenta. */
  title: string;
  /** Ferramenta e item ("Infusões contínuas · Noradrenalina"). */
  section: string | null;
  /** "ANY App v4 (95c8fba), conteúdo 1.0.0". */
  sourceVersion: string;
  url: string | null;
  /** Referência bibliográfica que o ANY cita para o item; `null` quando não cita. */
  reference: string | null;
  /** Procedência no motor (`ContentProvenance.source`): arquivo e commit do ANY. */
  origin: string;
  /** Versão do conteúdo no motor (`ContentProvenance.version`). */
  contentVersion: string;
  contentUpdatedAt: string;
  /** "v4" de "ANY App v4"; `null` se a procedência não diz. */
  anyVersion: string | null;
  /** Commit do ANY de onde o conteúdo foi portado ("95c8fba"). */
  anyCommit: string | null;
  textSha256: string;
}

export type KnowledgeCardSource = KnowledgeCardGuidelineSource | KnowledgeCardToolSource;

export interface KnowledgeCardContent {
  question: string;
  /** População e contexto em que a resposta vale ("adulto no PS, sem choque"). */
  population: string | null;
  /** Resposta curta (até 3 frases), citada. */
  answer: string;
  answerCitations: KnowledgeCardCitation[];
  claims: KnowledgeCardClaim[];
  sources: KnowledgeCardSource[];
}

/** Na escrita, a fonte é só a chave e o chunk (ou o item do motor): o resto o servidor resolve. */
export type KnowledgeCardSourceRef =
  | { key: string; chunkId: string }
  | { key: string; kind: 'clinical_tool'; toolItemId: string };

export interface KnowledgeCardContentInput extends Omit<KnowledgeCardContent, 'sources'> {
  sources: KnowledgeCardSourceRef[];
}

/** Problema que impede gravar uma versão: citação não encontrada, dose sem fonte… */
export interface KnowledgeCardContentIssue {
  path: string;
  message: string;
}

export interface KnowledgeCardPhysicianRef {
  id: string;
  name: string | null;
  crmUf: string;
  crmNumber: string;
  crmVerified: boolean;
}

/** CC-403/CC-412 — de qual rascunho de IA a versão saiu. */
export interface KnowledgeCardDraftProvenance {
  draftId: string;
  requestedModel: string;
  servedModel: string | null;
  promptSha256: string;
  sourceContentSha256: string;
  createdAt: string;
}

/**
 * CC-405 — achado da revisão clínica das Ferramentas (CC-310) que o revisor
 * precisa ver antes de assinar um cartão importado. Fica na versão, fora do
 * conteúdo assinado: é nota para o revisor, não texto para o médico.
 */
export interface KnowledgeCardReviewFlag {
  /** "docs/ferramentas/revisao-clinica/infusoes.md#1.1". */
  ref: string;
  title: string;
  detail: string;
}

/** CC-405 — de qual importação do ANY a versão saiu. */
export interface KnowledgeCardImportOrigin {
  importId: string;
  /** Ferramenta pedida na importação (`--tool`); `null` quando importou todas. */
  toolId: string | null;
  createdAt: string;
}

export interface KnowledgeCardReview {
  decision: KnowledgeCardReviewDecision;
  reviewer: KnowledgeCardPhysicianRef;
  reviewedAt: string;
  comment: string | null;
  durationMs: number | null;
  validUntil: string | null;
}

export interface KnowledgeCardVersionView {
  id: string;
  version: number;
  content: KnowledgeCardContent;
  contentSha256: string;
  authorKind: KnowledgeCardAuthorKind;
  authorPhysician: KnowledgeCardPhysicianRef | null;
  draft: KnowledgeCardDraftProvenance | null;
  /** CC-405 — versão importada do ANY; `null` nas outras. */
  importOrigin: KnowledgeCardImportOrigin | null;
  /** CC-405 — achados da revisão clínica a ver antes de assinar; vazio fora da importação. */
  reviewFlags: KnowledgeCardReviewFlag[];
  review: KnowledgeCardReview | null;
  createdAt: string;
}

/** Versão publicada: quem assinou e até quando vale — o "Revisado por" do CC-408. */
export interface KnowledgeCardPublication {
  version: number;
  reviewer: KnowledgeCardPhysicianRef;
  reviewedAt: string;
  validUntil: string;
}

export interface KnowledgeCardSummary {
  id: string;
  institutionId: string | null;
  topic: string;
  syndrome: PsSyndrome | null;
  status: KnowledgeCardStatus;
  displayStatus: KnowledgeCardDisplayStatus;
  currentVersion: number;
  /** Pergunta da versão mais recente. */
  question: string;
  /** CC-405 — "any:infusoes/noradrenalina" no cartão importado; `null` nos outros. */
  sourceKey: string | null;
  /** CC-405 — revisor indicado na importação (o lote só ele assina). */
  assignedReviewer: KnowledgeCardPhysicianRef | null;
  published: KnowledgeCardPublication | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCardListPage {
  items: KnowledgeCardSummary[];
  total: number;
  countsByDisplayStatus: Record<KnowledgeCardDisplayStatus, number>;
}

/** Detalhe: o cartão e todas as versões, da mais recente para a mais antiga. */
export interface KnowledgeCardDetail extends KnowledgeCardSummary {
  archivedAt: string | null;
  versions: KnowledgeCardVersionView[];
}

/** GET /admin/knowledge-cards */
export interface ListKnowledgeCardsQuery {
  displayStatus?: KnowledgeCardDisplayStatus;
  syndrome?: PsSyndrome;
  institutionId?: string;
  /** CC-405 — só os cartões importados desta ferramenta do ANY. */
  importTool?: AnyCardToolId;
  /** Padrão 20, até 100. */
  limit?: number;
  offset?: number;
}

/** POST /admin/knowledge-cards/drafts — pede rascunhos à IA para um tema. */
export interface CreateKnowledgeCardDraftRequest {
  topic: string;
  syndrome?: PsSyndrome;
  institutionId?: string;
  /** Trechos de fonte; sem eles, a consulta de diretrizes escolhe pelo tema. */
  chunkIds?: string[];
  /** `false` deixa os cartões em rascunho, fora da fila de revisão. Padrão `true`. */
  submitForReview?: boolean;
}

export interface KnowledgeCardDraftRejection {
  index: number;
  question: string;
  issues: KnowledgeCardContentIssue[];
}

export interface KnowledgeCardDraftRun {
  id: string;
  topic: string;
  syndrome: PsSyndrome | null;
  institutionId: string | null;
  status: KnowledgeCardDraftStatus;
  requestedModel: string;
  servedModel: string | null;
  promptSha256: string;
  sourceContentSha256: string;
  sourceChunkIds: string[];
  cardsAccepted: number;
  cardsRejected: number;
  rejections: KnowledgeCardDraftRejection[];
  failureReason: string | null;
  costUsd: number;
  latencyMs: number;
  createdAt: string;
}

export interface KnowledgeCardDraftResult {
  draft: KnowledgeCardDraftRun;
  /** Cartões criados por este rascunho (os que passaram na checagem de citação). */
  cardIds: string[];
}

export interface KnowledgeCardDraftPage {
  items: KnowledgeCardDraftRun[];
  total: number;
}

/**
 * POST /admin/knowledge-cards/:id/versions — "Corrigir" (CC-404): o conteúdo
 * inteiro da nova versão. `basedOnVersion` é a versão que o médico viu; se
 * outra versão entrou no meio, 409.
 */
export interface CreateKnowledgeCardVersionRequest {
  basedOnVersion: number;
  content: KnowledgeCardContentInput;
}

/** `version` em toda transição: o revisor decide sobre a versão que viu. */
export interface SubmitKnowledgeCardRequest {
  version: number;
}

export interface ApproveKnowledgeCardRequest {
  version: number;
  comment?: string;
  /** Validade da aprovação em meses; padrão 12. */
  validityMonths?: number;
  reviewDurationMs?: number;
}

export interface RejectKnowledgeCardRequest {
  version: number;
  reason: string;
  reviewDurationMs?: number;
}

export interface ArchiveKnowledgeCardRequest {
  reason: string;
}

/** Um cartão do lote, na versão que o revisor viu. */
export interface KnowledgeCardBatchItem {
  cardId: string;
  version: number;
}

/**
 * POST /admin/knowledge-cards/import-batches/sign (CC-405) — o revisor
 * indicado assina, de uma vez, os cartões importados de uma ferramenta do
 * ANY que estão em revisão. Cada item traz a versão que ele viu; o lote é
 * tudo ou nada.
 */
export interface SignKnowledgeCardBatchRequest {
  toolId: AnyCardToolId;
  items: KnowledgeCardBatchItem[];
  comment?: string;
  /** Validade da aprovação em meses; padrão 12. */
  validityMonths?: number;
}

export interface KnowledgeCardBatchSignResult {
  batchId: string;
  toolId: AnyCardToolId;
  approved: Array<KnowledgeCardBatchItem & { contentSha256: string }>;
}

/**
 * CC-408 — cartão publicado que a decisão (e a pergunta rápida da CC-501)
 * pode usar: a versão assinada e quem assinou. Só servidor.
 */
export interface ReviewedCard {
  cardId: string;
  institutionId: string | null;
  topic: string;
  syndrome: PsSyndrome | null;
  versionId: string;
  version: number;
  content: KnowledgeCardContent;
  contentSha256: string;
  reviewer: KnowledgeCardPhysicianRef;
  reviewedAt: string;
  validUntil: string;
}

/** Quem assinou, como o médico do plantão vê: nome e CRM, sem id interno. */
export interface KnowledgeCardReviewerCredential {
  name: string | null;
  crmNumber: string;
  crmUf: string;
}

/**
 * GET /knowledge-cards/:id — o cartão publicado, aberto pelo "Revisado por"
 * da tela do plano (CC-408). `displayStatus` `needs_review`: a aprovação
 * venceu e o cartão não entra mais na decisão.
 */
export interface PublishedKnowledgeCard {
  id: string;
  topic: string;
  syndrome: PsSyndrome | null;
  displayStatus: Extract<KnowledgeCardDisplayStatus, 'published' | 'needs_review'>;
  version: number;
  content: KnowledgeCardContent;
  reviewer: KnowledgeCardReviewerCredential;
  reviewedAt: string;
  validUntil: string;
}
