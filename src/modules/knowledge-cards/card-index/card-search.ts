/**
 * CC-406 — busca semântica nos cartões indexados: tipos e a junção das
 * consultas. A relevância clínica (síndrome, tema, portão da CC-407) fica
 * para quem chama: a busca só diz quais cartões válidos são os vizinhos mais
 * próximos de cada consulta.
 */

export interface CardSearchRequest {
  /**
   * Consultas curtas, já sem dado de paciente: as `searchQueries` do
   * entendimento do caso (ADR-013) ou a pergunta rápida da CC-501 depois da
   * de-identificação. Nunca o texto bruto do caso.
   */
  queries: readonly string[];
  /** ADR-009: `null` só vê cartões globais; com instituição, globais + os dela. */
  institutionId: string | null;
  /** Vizinhos lidos do banco por consulta. */
  limitPerQuery: number;
}

export interface CardSearchHit {
  cardId: string;
  /** A versão publicada que o vetor representa. */
  versionId: string;
  /** Cosseno com a consulta mais próxima. */
  similarity: number;
  /** Índices das consultas que acharam o cartão — vai para o log, sem texto. */
  queryIndexes: number[];
}

/** Por que a busca não rodou: a análise segue sem cartões, como antes deles. */
export type CardSearchUnavailableReason = 'no_queries' | 'embeddings_disabled' | 'embedding_failed';

export type CardSearchOutcome =
  | { status: 'ok'; hits: CardSearchHit[] }
  | { status: 'unavailable'; reason: CardSearchUnavailableReason };

export interface CardQueryHit {
  cardId: string;
  versionId: string;
  similarity: number;
}

/**
 * Junta as consultas pela MELHOR similaridade de cada cartão (como a busca
 * dirigida das diretrizes, `mergeQueryRankings`): somar premiaria o cartão
 * genérico que aparece em toda consulta. Ordem: da maior similaridade para a
 * menor; empate fica com quem apareceu primeiro.
 */
export function mergeCardHits(perQuery: ReadonlyArray<readonly CardQueryHit[]>): CardSearchHit[] {
  const merged = new Map<string, CardSearchHit>();
  perQuery.forEach((hits, queryIndex) => {
    for (const hit of hits) {
      const current = merged.get(hit.cardId);
      if (!current) {
        merged.set(hit.cardId, { ...hit, queryIndexes: [queryIndex] });
        continue;
      }
      if (!current.queryIndexes.includes(queryIndex)) current.queryIndexes.push(queryIndex);
      if (hit.similarity > current.similarity) {
        current.similarity = hit.similarity;
        current.versionId = hit.versionId;
      }
    }
  });
  return [...merged.values()].sort((left, right) => right.similarity - left.similarity);
}

/** Consultas sem vazias nem repetidas (sem caixa), na ordem recebida. */
export function distinctCardQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const query of queries) {
    const trimmed = query.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    distinct.push(trimmed);
  }
  return distinct;
}

/** Vetor no formato literal do pgvector (`[0.1,0.2,…]`). */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}
