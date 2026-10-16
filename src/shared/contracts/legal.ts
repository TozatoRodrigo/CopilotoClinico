/**
 * CC-905 — documentos legais versionados (termos de uso e política de
 * privacidade) e o aceite de cada médico, compartilhado entre a API
 * (src/modules/legal) e o web (tela de aceite e console admin).
 *
 * - O texto de cada versão vive no catálogo do código
 *   (src/modules/legal/legal-document-catalog.ts) e vale quando um ADMIN a
 *   publica: a vigente de cada tipo é a publicada por último.
 * - Com `LEGAL_TERMS_V2` ligada, quem não aceitou a versão vigente dos tipos
 *   exigidos recebe 428 (`TERMS_ACCEPTANCE_REQUIRED`) nas rotas autenticadas,
 *   exceto as de aceite, logout e LGPD. Desligada (padrão), nada muda.
 *
 * O aceite guarda só o vínculo (médico, versão) e a data. Nada aqui carrega
 * dado de paciente.
 */

// ── Tipos de documento ──────────────────────────────────────────────────────

/**
 * Tipos conhecidos. Um tipo novo (termo do beta, da mentoria) entra aqui e no
 * catálogo; o banco guarda o tipo como texto, sem migração.
 */
export const LEGAL_DOCUMENT_TYPES = ['terms_of_use', 'privacy_policy'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

/**
 * Tipos cujo aceite o gate exige de toda conta autenticada. Um termo
 * contextual (ex.: o da mentoria, aceito a cada pedido) fica fora desta lista.
 */
export const GATED_LEGAL_DOCUMENT_TYPES: readonly LegalDocumentType[] = [
  'terms_of_use',
  'privacy_policy',
];

export const LEGAL_DOCUMENT_TYPE_LABELS: Readonly<Record<LegalDocumentType, string>> = {
  terms_of_use: 'Termos de Uso',
  privacy_policy: 'Política de Privacidade',
};

export interface LegalDocumentSection {
  heading: string;
  paragraphs: readonly string[];
}

/** Uma versão publicada, como a API devolve. */
export interface LegalDocumentView {
  id: string;
  type: LegalDocumentType;
  version: string;
  title: string;
  /** Texto ainda sem parecer jurídico: a tela diz isso em vez de esconder. */
  provisional: boolean;
  /** sha256 (hex) do texto: título e seções. Mesmo hash = mesmo texto. */
  contentHash: string;
  /** ISO 8601 — quando passou a valer. */
  publishedAt: string;
  /** O que mudou desde a versão anterior (no primeiro aceite, o resumo). */
  changeSummary: readonly string[];
  sections: readonly LegalDocumentSection[];
}

// ── Médico: status e aceite ─────────────────────────────────────────────────

/** Versão vigente que o médico ainda não aceitou. */
export interface PendingLegalDocument extends LegalDocumentView {
  /** Última versão do mesmo tipo que o médico aceitou; null = primeiro aceite. */
  previouslyAcceptedVersion: string | null;
}

/** `GET /legal/status` (também a resposta de `POST /legal/acceptances`). */
export interface LegalStatus {
  /** `LEGAL_TERMS_V2` ligada. Desligada, nada é exigido e `pending` vem vazio. */
  enabled: boolean;
  /** Falta aceitar alguma versão vigente: as rotas protegidas respondem 428. */
  acceptanceRequired: boolean;
  pending: PendingLegalDocument[];
}

/** `POST /legal/acceptances` — os ids das versões que o médico leu na tela. */
export interface AcceptLegalDocumentsRequest {
  documentIds: string[];
}

// ── Erros com `code` próprio ────────────────────────────────────────────────

export const TERMS_ACCEPTANCE_REQUIRED = 'TERMS_ACCEPTANCE_REQUIRED' as const;
/** 428 Precondition Required: nenhuma outra recusa da API usa este status. */
export const TERMS_ACCEPTANCE_REQUIRED_STATUS = 428;

/** Rota protegida chamada por quem ainda não aceitou a versão vigente. */
export interface TermsAcceptanceRequiredError {
  statusCode: typeof TERMS_ACCEPTANCE_REQUIRED_STATUS;
  error: 'Precondition Required';
  code: typeof TERMS_ACCEPTANCE_REQUIRED;
  message: string;
}

export const LEGAL_DOCUMENT_OUTDATED = 'LEGAL_DOCUMENT_OUTDATED' as const;

/** Aceite de uma versão que deixou de ser a vigente: a tela recarrega o texto. */
export interface LegalDocumentOutdatedError {
  statusCode: 409;
  error: 'Conflict';
  code: typeof LEGAL_DOCUMENT_OUTDATED;
  message: string;
}

/** Tela de aceite no web; o api-client manda para lá ao receber 428. */
export const LEGAL_ACCEPTANCE_PATH = '/aceite-termos';

// ── Console admin ───────────────────────────────────────────────────────────

export interface LegalAcceptanceStats {
  /** Contas (não eliminadas) que aceitaram esta versão. */
  accepted: number;
  /** Contas não eliminadas. */
  eligible: number;
  /** 0–100, uma casa decimal. */
  percent: number;
}

export interface LegalDocumentHistoryItem {
  id: string;
  version: string;
  provisional: boolean;
  contentHash: string;
  publishedAt: string;
  accepted: number;
}

/** Versão do catálogo do código ainda não publicada. */
export interface LegalDocumentDraftSummary {
  version: string;
  title: string;
  provisional: boolean;
  contentHash: string;
  changeSummary: readonly string[];
}

export interface LegalAdminDocumentType {
  type: LegalDocumentType;
  label: string;
  current: (LegalDocumentView & { acceptance: LegalAcceptanceStats }) | null;
  /** Versões publicadas, da mais nova para a mais antiga (inclui a vigente). */
  history: LegalDocumentHistoryItem[];
  drafts: LegalDocumentDraftSummary[];
}

/** `GET /admin/legal/documents`. */
export interface LegalAdminOverview {
  enabled: boolean;
  /** Contas não eliminadas. */
  eligibleAccounts: number;
  /** Contas que aceitaram todas as versões vigentes exigidas; null sem nada publicado. */
  fullyAccepted: number | null;
  types: LegalAdminDocumentType[];
}

/** `POST /admin/legal/documents` — publica uma versão do catálogo (só ADMIN). */
export interface PublishLegalDocumentRequest {
  type: LegalDocumentType;
  version: string;
}
