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
 * Calibrados em produção em 24/09/2026 (text-embedding-3-small, base oficial
 * completa, 5 casos de referência — ofídico, escorpiônico, AVC isquêmico,
 * crise hipertensiva, dengue fi-001):
 *
 * - documento certo: similaridade 0,55–0,64;
 * - ruído (Chagas, doença falciforme, agrotóxicos em caso de dengue): 0,44–0,54.
 *
 * O piso de 0,35 inicial deixava o ruído entrar em todo caso. Com 0,52 a
 * maior parte sai; ainda passa 1 trecho de documento "misto" (Chagas,
 * falciforme) entre 0,52 e 0,54 — subir o piso mais cortaria o PCDT de AVC
 * (0,55). A penalização de 0,10 tira o PCDT de HAS ambulatorial da crise
 * hipertensiva (0,05 não tirava). Margem e amostra pequenas: a calibração com
 * os casos sintéticos (passo 8 do plano) substitui estes números. Todos
 * ajustáveis por env sem redeploy.
 */
export const DEFAULT_OFFICIAL_MIN_SEMANTIC_SCORE = 0.52;
export const DEFAULT_OFFICIAL_CHRONIC_PENALTY = 0.1;
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
