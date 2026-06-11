export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel: string | null;
  institutionId: string | null;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchHit {
  chunkId: string;
  score: number;
  institutionId: string | null;
}

const RRF_K = 60;

/**
 * PROT-004: boost de ranking aplicado a chunks da instituição do encounter,
 * para que protocolos/diretrizes institucionais precedam conteúdo global em
 * caso de score semântico equivalente. Configurável: ajuste este valor para
 * calibrar o quanto a precedência institucional pesa frente ao RRF (cujos
 * incrementos individuais são ~1/61 ≈ 0.016).
 */
export const INSTITUTION_RANK_BOOST = 0.05;

export function reciprocalRankFuse(
  semanticResults: SearchHit[],
  keywordResults: SearchHit[],
): Map<string, number> {
  const scores = new Map<string, number>();

  semanticResults.forEach((result, index) => {
    const current = scores.get(result.chunkId) ?? 0;
    scores.set(result.chunkId, current + 1 / (RRF_K + index + 1));
  });

  keywordResults.forEach((result, index) => {
    const current = scores.get(result.chunkId) ?? 0;
    scores.set(result.chunkId, current + 1 / (RRF_K + index + 1));
  });

  return scores;
}

/**
 * PROT-004: aplica `INSTITUTION_RANK_BOOST` aos chunks cujo `institutionId`
 * corresponde à instituição do encounter. Chunks globais (institutionId
 * null) e chunks de outras instituições (que nunca deveriam chegar aqui —
 * isolamento é garantido no WHERE da busca) não recebem boost.
 */
export function applyInstitutionBoost(
  scores: Map<string, number>,
  chunkInstitutions: Map<string, string | null>,
  encounterInstitutionId: string | null | undefined,
  boost: number = INSTITUTION_RANK_BOOST,
): Map<string, number> {
  if (!encounterInstitutionId) {
    return scores;
  }

  const boosted = new Map(scores);
  for (const [chunkId, score] of boosted) {
    if (chunkInstitutions.get(chunkId) === encounterInstitutionId) {
      boosted.set(chunkId, score + boost);
    }
  }
  return boosted;
}

export function sortByScore(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return [...chunks].sort((a, b) => b.score - a.score);
}
