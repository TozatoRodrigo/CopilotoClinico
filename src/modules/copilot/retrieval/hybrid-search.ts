export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel: string | null;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchHit {
  chunkId: string;
  score: number;
}

const RRF_K = 60;

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

export function sortByScore(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return [...chunks].sort((a, b) => b.score - a.score);
}
