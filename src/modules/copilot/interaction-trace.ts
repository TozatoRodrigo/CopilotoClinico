import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PS_SYNDROMES, type PsSyndrome } from '../../shared/contracts/clinical';
import { maskPII } from './guardrails/pii-filter';
import type { RetrievalCoverage } from './retrieval/hybrid-search';

/**
 * Rastro técnico gravado junto de cada análise (`ai_interactions.params` e
 * `.citations`), lido por quem precisa reproduzir um caso: a tela de
 * resultado, o feedback do médico (F7) e a fila de triagem (F0-D).
 */

/**
 * KB-005/KB-006 — lê `retrievalCoverage` do JSON `params` da interação.
 * Interações gravadas antes desta mudança não têm a chave: devolvem `null`,
 * e a UI simplesmente não mostra o aviso de cobertura (nunca inventa "full").
 */
export function extractRetrievalCoverage(
  params: Prisma.JsonValue | null,
): RetrievalCoverage | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const value = (params as Record<string, unknown>).retrievalCoverage;
  return value === 'full' || value === 'partial' || value === 'none' ? value : null;
}

/**
 * F7 — ids das fontes que a análise realmente citou. Junto dos
 * `retrievedChunkIds`, é o que permite distinguir "a base não tinha o
 * conteúdo" de "tinha, e o modelo citou outra coisa".
 */
export function extractCitedChunkIds(citations: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(citations)) return [];
  return citations
    .map((citation) =>
      citation && typeof citation === 'object' && !Array.isArray(citation)
        ? (citation as Record<string, unknown>).chunkId
        : null,
    )
    .filter((chunkId): chunkId is string => typeof chunkId === 'string');
}

/** Mesmos tetos do entendimento (CaseUnderstanding): de 1 a 4 consultas curtas. */
const MAX_SEARCH_QUERIES = 4;
const MAX_SEARCH_QUERY_CHARS = 200;

const understandingSignalsSchema = z.object({
  understanding: z
    .object({
      syndrome: z.enum(PS_SYNDROMES).nullable().catch(null),
      searchQueries: z.array(z.string()).catch([]),
    })
    .nullable()
    .catch(null),
});

export interface UnderstandingSignals {
  syndrome: PsSyndrome | null;
  searchQueries: string[];
}

/**
 * CC-703 — o que o entendimento (Etapa 1) registrou sobre o caso, sem o texto
 * dele: a síndrome de PS e as consultas da busca dirigida. É o formato da
 * lacuna (CC-409) e a síndrome sugerida no rascunho de caso do gabarito.
 *
 * Interações sem entendimento (modo legacy, anteriores à Fase 1 ou com a
 * etapa falhada) devolvem `syndrome: null` e nenhuma consulta. As consultas
 * nascem do caso já redigido, mas o modelo pode copiar um identificador que a
 * máscara não pegou no caso: passam de novo pela máscara.
 */
export function extractUnderstandingSignals(rawOutput: Prisma.JsonValue): UnderstandingSignals {
  const parsed = understandingSignalsSchema.safeParse(rawOutput);
  const understanding = parsed.success ? parsed.data.understanding : null;
  if (!understanding) return { syndrome: null, searchQueries: [] };
  return {
    syndrome: understanding.syndrome,
    searchQueries: understanding.searchQueries
      .map((query) => maskPII(query.trim()).redacted.slice(0, MAX_SEARCH_QUERY_CHARS))
      .filter((query) => query.length > 0)
      .slice(0, MAX_SEARCH_QUERIES),
  };
}
