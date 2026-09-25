import type { GuidelineConsultResult } from '../../../shared/contracts/clinical';

/**
 * Consulta de diretrizes dentro do caso — junta a busca por significado e a
 * busca por palavra-chave e agrupa por documento.
 *
 * Origem: médico do piloto (25/09/2026), criança picada por escorpião. O botão
 * "Buscar nas diretrizes" mandava o RACIOCÍNIO inteiro do modelo (~100
 * palavras) para uma busca lexical que exige TODAS as palavras, só na base
 * curada — resultado: nenhuma diretriz, e o médico fora do caso, sem volta.
 *
 * As duas buscas se completam:
 * - por significado acha o documento certo a partir do caso descrito em texto
 *   livre ("picada de escorpião na perna, febre");
 * - por palavra-chave acha termo exato numa consulta curta ("escorpião",
 *   "soro antibotrópico"), onde o embedding de duas palavras é fraco.
 */

export interface ConsultCandidate {
  chunkId: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  text: string;
  status: 'approved' | 'official_unreviewed';
  institutionId: string | null;
  metadata: Record<string, unknown>;
  /** Cosseno com a consulta; `null` se o chunk não tem embedding. */
  similarity: number | null;
}

export interface ConsultRankingOptions {
  /** Abaixo disto, só entra se a palavra-chave também casou. */
  minSimilarity: number;
  /** Bônus de ranking para quem casou nas duas buscas. */
  keywordBoost: number;
  maxPerDocument: number;
  limit: number;
}

/**
 * Consulta manual: o médico julga cada trecho, então o piso é mais baixo que o
 * do prompt (0,52 para a base oficial) — mas não zero, senão a lista enche de
 * vizinho semântico (calibração de 24/09/2026: ruído a partir de ~0,44).
 */
export const DEFAULT_CONSULT_OPTIONS: ConsultRankingOptions = {
  minSimilarity: 0.45,
  keywordBoost: 0.05,
  maxPerDocument: 2,
  limit: 8,
};

function documentKey(candidate: ConsultCandidate): string {
  const key = candidate.metadata.documentKey;
  return typeof key === 'string' ? key : `curated:${candidate.source}`;
}

function origin(candidate: ConsultCandidate): GuidelineConsultResult['origin'] {
  if (candidate.status === 'official_unreviewed') return 'official_unreviewed';
  return candidate.institutionId ? 'institutional' : 'public';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function rankConsultResults(
  semantic: ConsultCandidate[],
  keyword: ConsultCandidate[],
  options: ConsultRankingOptions = DEFAULT_CONSULT_OPTIONS,
): GuidelineConsultResult[] {
  const keywordIds = new Set(keyword.map((candidate) => candidate.chunkId));
  const semanticIds = new Set(semantic.map((candidate) => candidate.chunkId));
  const byId = new Map<string, ConsultCandidate>();
  for (const candidate of [...semantic, ...keyword]) byId.set(candidate.chunkId, candidate);

  const scored = [...byId.values()]
    .map((candidate) => {
      const inKeyword = keywordIds.has(candidate.chunkId);
      const similarity = candidate.similarity ?? 0;
      return {
        candidate,
        inKeyword,
        matchedBy: (semanticIds.has(candidate.chunkId)
          ? inKeyword
            ? 'both'
            : 'semantic'
          : 'keyword') as GuidelineConsultResult['matchedBy'],
        score: similarity + (inKeyword ? options.keywordBoost : 0),
        similarity,
      };
    })
    .filter((entry) => entry.inKeyword || entry.similarity >= options.minSimilarity)
    .sort((a, b) => b.score - a.score);

  const perDocument = new Map<string, number>();
  const results: GuidelineConsultResult[] = [];
  for (const entry of scored) {
    if (results.length >= options.limit) break;
    const key = documentKey(entry.candidate);
    const count = perDocument.get(key) ?? 0;
    if (count >= options.maxPerDocument) continue;
    perDocument.set(key, count + 1);

    const { candidate } = entry;
    results.push({
      chunkId: candidate.chunkId,
      source: candidate.source,
      sourceVersion: candidate.sourceVersion,
      section: stringOrNull(candidate.metadata.section),
      text: candidate.text,
      origin: origin(candidate),
      documentUrl: stringOrNull(candidate.metadata.url),
      specialty: candidate.specialty,
      similarity: Math.round(entry.similarity * 1000) / 1000,
      matchedBy: entry.matchedBy,
    });
  }

  return results;
}
