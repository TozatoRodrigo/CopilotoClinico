import { normalizeSearchText } from '../catalog';
import { ANTIDOTES, type Antidote } from './antidotes';

/**
 * Busca do guia de antídotos: nome, indicação ou termo de busca contendo o
 * texto, como no ANY, mas sem acento nem caixa ("acetilcisteina" acha a NAC).
 * Mantém a ordem do guia (disponíveis primeiro).
 */
export function searchAntidotes(query: string): readonly Antidote[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return ANTIDOTES;
  return ANTIDOTES.filter((antidote) =>
    [antidote.name, antidote.indication, antidote.searchTerms].some((field) =>
      normalizeSearchText(field).includes(normalized),
    ),
  );
}
