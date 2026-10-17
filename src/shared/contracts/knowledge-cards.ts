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

export const KNOWLEDGE_CARD_AUTHOR_KINDS = ['ai', 'physician'] as const;
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
 */
export interface KnowledgeCardSource {
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

/** Na escrita, a fonte é só a chave e o chunk: o resto o servidor resolve. */
export interface KnowledgeCardSourceRef {
  key: string;
  chunkId: string;
}

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
