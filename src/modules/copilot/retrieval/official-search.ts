/**
 * ADR-010 — Seleção de chunks da base oficial do MS (PCDT/DDT/DB/PU).
 *
 * A base oficial é ~10 mil chunks, a maior parte de doença crônica, contra
 * algumas centenas na base curada. Sem regras próprias, ela vira exatamente o
 * "vizinho semântico" que produziu os incidentes dengue→sepse e
 * cefaleia→HSA: o PCDT de hipertensão ambulatorial respondendo por uma crise
 * hipertensiva. Por isso a base oficial tem pool separado e quatro regras:
 *
 * 1. Piso próprio, mais alto que o da base curada — calibrável por env.
 * 2. Penalização de documento classificado como crônico: o Copiloto é de
 *    pronto-socorro, todo caso é agudo. A penalização baixa a similaridade
 *    efetiva, então um PCDT crônico só entra com encaixe claramente melhor.
 * 3. Teto por documento: dois trechos do mesmo PCDT não podem ocupar todas as
 *    vagas.
 * 4. Teto por análise: a base oficial complementa a curada, não a substitui.
 */

export type OfficialCareSetting = 'agudo' | 'cronico' | 'misto' | 'indefinido';

export interface OfficialHit {
  chunkId: string;
  /** Similaridade de cosseno bruta. */
  similarity: number;
  documentId: string;
  careSetting: OfficialCareSetting;
}

export interface OfficialSelectionOptions {
  minSemanticScore: number;
  chronicPenalty: number;
  maxPerDocument: number;
  topK: number;
}

export interface OfficialSelection {
  /** Na ordem de similaridade efetiva, já cortados pelos tetos. */
  selected: Array<OfficialHit & { effectiveScore: number }>;
  bestSemanticScore: number;
  discardedByFloor: number;
}

/**
 * Defaults ainda NÃO calibrados — a calibração é o passo 8 do plano
 * (`docs/plano-fontes-oficiais-pcdt.md`), com os casos sintéticos e os de
 * incidente. Todos ajustáveis por env sem redeploy.
 */
export const DEFAULT_OFFICIAL_MIN_SEMANTIC_SCORE = 0.35;
export const DEFAULT_OFFICIAL_CHRONIC_PENALTY = 0.05;
export const DEFAULT_OFFICIAL_MAX_PER_DOCUMENT = 2;
export const DEFAULT_OFFICIAL_TOP_K = 3;

export function effectiveOfficialScore(
  hit: Pick<OfficialHit, 'similarity' | 'careSetting'>,
  chronicPenalty: number,
): number {
  return hit.careSetting === 'cronico' ? hit.similarity - chronicPenalty : hit.similarity;
}

export function selectOfficialChunks(
  hits: OfficialHit[],
  options: OfficialSelectionOptions,
): OfficialSelection {
  const bestSemanticScore = hits.reduce((best, hit) => Math.max(best, hit.similarity), 0);

  const passing = hits
    .map((hit) => ({ ...hit, effectiveScore: effectiveOfficialScore(hit, options.chronicPenalty) }))
    .filter((hit) => hit.effectiveScore >= options.minSemanticScore)
    .sort((a, b) => b.effectiveScore - a.effectiveScore);

  const perDocument = new Map<string, number>();
  const selected: OfficialSelection['selected'] = [];
  for (const hit of passing) {
    if (selected.length >= options.topK) break;
    const count = perDocument.get(hit.documentId) ?? 0;
    if (count >= options.maxPerDocument) continue;
    perDocument.set(hit.documentId, count + 1);
    selected.push(hit);
  }

  return {
    selected,
    bestSemanticScore,
    discardedByFloor: hits.length - passing.length,
  };
}
