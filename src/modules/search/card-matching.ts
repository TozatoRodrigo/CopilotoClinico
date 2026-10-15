import { normalizeSearchText } from '../../shared/clinical-tools/catalog';
import type { PsSyndrome } from '../../shared/contracts/clinical';
import { anyCardDrafts } from '../knowledge-cards/any-import/any-card-catalog';
import { anySourceKey, anyToolName } from '../knowledge-cards/any-import/any-card-draft';
import { PS_SYNDROME_SEARCH_TERMS, searchTokens } from './syndrome-terms';

/**
 * CC-502 — busca textual dos cartões publicados no ⌘K: pelo tema, pela
 * pergunta, pela síndrome e, no cartão importado do ANY, pelos sinônimos do
 * item no motor ("nora" acha o cartão da noradrenalina, como acha a droga
 * nas Ferramentas). Sem embedding: o ⌘K busca a cada pausa da digitação, e
 * a busca semântica (CC-406) é da decisão.
 */

export interface CardSearchCandidate {
  id: string;
  topic: string;
  question: string;
  syndrome: string | null;
  sourceKey: string | null;
}

let anyAliases: ReadonlyMap<string, readonly string[]> | null = null;

/**
 * Sinônimos de cada item do ANY, pela chave do cartão importado: o rótulo do
 * item, os termos que a revisão usa para achá-lo (nome, id e apelidos da
 * droga) e o nome da ferramenta. Montado uma vez: o motor não muda com o
 * processo no ar.
 */
function aliasesBySourceKey(): ReadonlyMap<string, readonly string[]> {
  if (anyAliases) return anyAliases;
  anyAliases = new Map(
    anyCardDrafts().map((draft) => [
      anySourceKey(draft.itemId),
      [draft.itemLabel, ...draft.findingTerms, anyToolName(draft.toolId)],
    ]),
  );
  return anyAliases;
}

function syndromeTerms(syndrome: string | null): readonly string[] {
  return syndrome && syndrome in PS_SYNDROME_SEARCH_TERMS
    ? PS_SYNDROME_SEARCH_TERMS[syndrome as PsSyndrome]
    : [];
}

/**
 * Nota do cartão para a busca; 0 = não aparece. Toda palavra da busca
 * precisa estar no tema, na pergunta, na síndrome ou nos sinônimos. Tema que
 * começa com a busca vem primeiro, depois tema que a contém, sinônimo que
 * começa com ela, pergunta que a contém, e o resto.
 */
export function scoreCard(candidate: CardSearchCandidate, query: string): number {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return 0;
  const phrase = tokens.join(' ');
  const topic = normalizeSearchText(candidate.topic);
  const question = normalizeSearchText(candidate.question);
  const aliases = (
    candidate.sourceKey ? (aliasesBySourceKey().get(candidate.sourceKey) ?? []) : []
  ).map(normalizeSearchText);
  const haystack = [topic, question, ...aliases, ...syndromeTerms(candidate.syndrome)]
    .map(normalizeSearchText)
    .join(' ');
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  if (topic.startsWith(phrase)) return 5;
  if (topic.includes(phrase)) return 4;
  if (aliases.some((alias) => alias.startsWith(phrase))) return 3;
  if (question.includes(phrase)) return 2;
  return 1;
}

/** Os cartões que casam com a busca, do mais ao menos relevante; empate pelo tema. */
export function rankCards<T extends CardSearchCandidate>(
  candidates: readonly T[],
  query: string,
): T[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCard(candidate, query) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.topic.localeCompare(right.candidate.topic, 'pt-BR'),
    )
    .map(({ candidate }) => candidate);
}
