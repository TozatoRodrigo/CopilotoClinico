import type { EncounterStatus, PsSyndrome } from './clinical';

/**
 * CC-502 — busca única do ⌘K: o que só o servidor sabe (cartões revisados,
 * protocolos e os casos do médico) numa chamada só, `GET /search?q=`.
 * Ferramentas, calculadoras e drogas ficam no web, no catálogo do motor:
 * funcionam sem sinal.
 *
 * Só tipos e listas de valores. O web importa daqui só tipos; os valores
 * estão espelhados em `web/src/lib/search-contract.ts`, e a paridade é
 * conferida em `tests/web-mirrors/search.spec.ts`.
 */

/** Grupos do servidor, na ordem do ⌘K (Ferramentas vem antes, do web). */
export const UNIFIED_SEARCH_GROUPS = ['cards', 'protocols', 'cases'] as const;
export type UnifiedSearchGroup = (typeof UNIFIED_SEARCH_GROUPS)[number];

/** Com menos que isto a busca acha meio catálogo: o ⌘K não chama o servidor. */
export const UNIFIED_SEARCH_MIN_CHARS = 2;
/** Busca de ⌘K, não texto de caso: o mesmo teto do `search` de `GET /encounters`. */
export const UNIFIED_SEARCH_MAX_CHARS = 100;
/** Itens por grupo: o ⌘K mostra poucos de cada e o médico refina digitando. */
export const UNIFIED_SEARCH_DEFAULT_LIMIT = 5;
export const UNIFIED_SEARCH_MAX_LIMIT = 10;

export interface UnifiedSearchQuery {
  q: string;
  /** Itens por grupo. */
  limit?: number;
}

/** Cartão revisado publicado e válido, da instituição do médico ou global (ADR-009). */
export interface CardSearchHit {
  id: string;
  topic: string;
  question: string;
  syndrome: PsSyndrome | null;
}

/**
 * Protocolo é um documento da base de diretrizes (curada ou oficial), não o
 * trecho: o ⌘K abre as Diretrizes já buscando pelo título dele.
 */
export interface ProtocolSearchHit {
  /** Título do documento. */
  source: string;
  sourceVersion: string;
  specialty: string;
  /** Protocolo da instituição do médico; `false` é da base pública. */
  institutional: boolean;
}

/**
 * Caso do próprio médico, achado pela data, pela síndrome do último
 * entendimento ou pelo rótulo (`patientRef`, identificador opaco — LGPD-001).
 * Nunca pelo texto clínico.
 */
export interface CaseSearchHit {
  id: string;
  patientRef: string | null;
  chiefComplaint: string | null;
  status: EncounterStatus;
  createdAt: string;
  syndrome: PsSyndrome | null;
}

/** Um grupo que falha não derruba os outros: o ⌘K mostra o erro só nele. */
export type UnifiedSearchGroupResult<T> = { status: 'ok'; items: T[] } | { status: 'error' };

export interface UnifiedSearchResponse {
  cards: UnifiedSearchGroupResult<CardSearchHit>;
  protocols: UnifiedSearchGroupResult<ProtocolSearchHit>;
  cases: UnifiedSearchGroupResult<CaseSearchHit>;
}
