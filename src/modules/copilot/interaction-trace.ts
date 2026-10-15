import type { Prisma } from '@prisma/client';
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
