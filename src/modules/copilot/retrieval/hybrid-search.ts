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

/**
 * KB-005/KB-006 — Piso de relevância.
 *
 * Origem: dois casos reportados em campo (dengue conduzido como sepse, cefaleia
 * em salvas apontada como hemorragia). Em ambos o cenário real não existia na
 * base, mas a busca devolveu os `topK` chunks mesmo assim — o RRF ordena por
 * POSIÇÃO e descarta a similaridade bruta, então o 5º melhor chunk de uma base
 * que não cobre o caso entrava no prompt com o mesmo status do melhor chunk de
 * uma base que cobre. Como o prompt marca tudo como
 * `TRUSTED_CURATED_SOURCE` e a Regra 1 obriga toda recomendação a citar um
 * chunk recuperado, o modelo era empurrado para o vizinho semântico.
 *
 * O piso devolve ao sistema a capacidade de dizer "minha base não cobre este
 * caso": chunk que não passa não entra no prompt, e quando nenhum passa o
 * `buildPrompt` cai no caminho já existente de `buildCaseOnlyUser`
 * (DECISION MATRIX path D — declarar a lacuna e perguntar).
 */
export type RetrievalCoverage = 'full' | 'partial' | 'none';

/**
 * Similaridade de cosseno mínima para um chunk ser considerado relevante.
 * Valor inicial conservador: em `text-embedding-3-small`, conteúdo do mesmo
 * domínio clínico costuma ficar acima de ~0.3 e conteúdo não relacionado
 * abaixo de ~0.25. Ajustável em runtime por `RETRIEVAL_MIN_SEMANTIC_SCORE`
 * (0 desliga o piso) — ver docs/runbook.md para o procedimento de calibração
 * com os 40 casos sintéticos do KB-001.
 */
export const DEFAULT_MIN_SEMANTIC_SCORE = 0.3;

/**
 * Acima deste valor a cobertura é considerada `full`. Entre o piso e este
 * valor a cobertura é `partial`: os chunks entram no prompt, mas acompanhados
 * de um aviso explícito de que o encaixe é fraco — ver
 * `buildWeakCoverageWarning` em prompt-builder.ts.
 */
export const DEFAULT_STRONG_SEMANTIC_SCORE = 0.45;

/**
 * `ts_rank` mínimo para um chunk encontrado APENAS pela busca lexical (sem
 * score semântico entre os candidatos) sobreviver ao piso. Mantido baixo
 * porque `plainto_tsquery` exige TODOS os termos da query: quando um chunk
 * casa lexicalmente, o casamento é praticamente exato.
 */
export const DEFAULT_MIN_KEYWORD_RANK = 0.01;

export interface RelevanceFloorInput {
  /** chunkId -> similaridade de cosseno (busca semântica). */
  semanticScores: Map<string, number>;
  /** chunkId -> ts_rank (busca lexical). */
  keywordScores: Map<string, number>;
  minSemanticScore: number;
  strongSemanticScore: number;
  minKeywordRank: number;
}

export interface RelevanceFloorResult {
  /** Ids que passaram no piso, na ordem recebida. */
  keptChunkIds: string[];
  coverage: RetrievalCoverage;
  /** Melhor similaridade entre TODOS os candidatos, inclusive os descartados. */
  bestSemanticScore: number;
  discardedCount: number;
}

export function applyRelevanceFloor(
  rankedChunkIds: string[],
  input: RelevanceFloorInput,
): RelevanceFloorResult {
  const { semanticScores, keywordScores, minSemanticScore, strongSemanticScore, minKeywordRank } =
    input;

  const bestSemanticScore = rankedChunkIds.reduce(
    (best, id) => Math.max(best, semanticScores.get(id) ?? 0),
    0,
  );

  // minSemanticScore <= 0 desliga o piso — mantém o comportamento anterior
  // byte a byte, para rollback imediato via env sem redeploy.
  if (minSemanticScore <= 0) {
    return {
      keptChunkIds: rankedChunkIds,
      coverage: rankedChunkIds.length > 0 ? 'full' : 'none',
      bestSemanticScore,
      discardedCount: 0,
    };
  }

  const keptChunkIds = rankedChunkIds.filter((id) => {
    const semantic = semanticScores.get(id);
    if (semantic !== undefined) return semantic >= minSemanticScore;
    // Chunk achado só pela busca lexical: sem similaridade para comparar,
    // decide pelo ts_rank.
    return (keywordScores.get(id) ?? 0) >= minKeywordRank;
  });

  const coverage: RetrievalCoverage =
    keptChunkIds.length === 0
      ? 'none'
      : bestSemanticScore >= strongSemanticScore
        ? 'full'
        : 'partial';

  return {
    keptChunkIds,
    coverage,
    bestSemanticScore,
    discardedCount: rankedChunkIds.length - keptChunkIds.length,
  };
}
