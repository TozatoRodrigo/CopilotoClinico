import type { PsSyndrome } from '../../shared/contracts/clinical';
import type { ShiftReviewStudySuggestion } from '../../shared/contracts/shift-review';
import type { ShiftReviewStoredSource } from './review-material';
import { MAX_STUDY_SUGGESTIONS_PER_THEME } from './shift-review.settings';

/**
 * CC-802 — o que estudar nos temas em que o médico errou marcando "Sei".
 *
 * O destino são os cartões revisados do tema (CC-402, PR #179), que ainda não
 * estão nesta base. Até lá, `CitedSourceSuggestions` devolve as fontes que as
 * próprias perguntas do tema citaram (a fonte já revisada na análise).
 *
 * Quando os cartões entrarem: um provedor que busca os cartões publicados da
 * síndrome (e, sem síndrome, pelo tema) substitui `CitedSourceSuggestions` em
 * shift-review.module.ts (`SHIFT_REVIEW_STUDY_SUGGESTIONS`), devolvendo
 * `knowledge_card`; tema sem cartão pode cair nas fontes citadas com
 * `suggestionsFromCitedSources`. O mapa, o contrato e a tela não mudam.
 */

export const SHIFT_REVIEW_STUDY_SUGGESTIONS = Symbol('SHIFT_REVIEW_STUDY_SUGGESTIONS');

/** Um tema do mapa que pede estudo. */
export interface StudyTheme {
  /** Chave do tema no mapa (`syndrome:…` ou `topic:…`). */
  key: string;
  syndrome: PsSyndrome | null;
  /** Temas das perguntas, o mais frequente primeiro. */
  topics: readonly string[];
  /** Fontes das perguntas do tema, as das respostas erradas com "Sei" primeiro. */
  citedSources: readonly ShiftReviewStoredSource[];
}

export interface StudySuggestionSource {
  /**
   * Sugestões por `StudyTheme.key`, numa leitura só para todos os temas.
   * Tema ausente no resultado sai sem sugestão.
   */
  suggest(
    themes: readonly StudyTheme[],
  ): Promise<ReadonlyMap<string, ShiftReviewStudySuggestion[]>>;
}

/** As fontes citadas pelas perguntas, sem repetir documento, na ordem recebida. */
export function suggestionsFromCitedSources(
  sources: readonly ShiftReviewStoredSource[],
  limit = MAX_STUDY_SUGGESTIONS_PER_THEME,
): ShiftReviewStudySuggestion[] {
  const seen = new Set<string>();
  const suggestions: ShiftReviewStudySuggestion[] = [];
  for (const source of sources) {
    if (suggestions.length >= limit) break;
    // Trechos diferentes da mesma diretriz são um documento só para estudar.
    const identity =
      source.kind === 'knowledge_card'
        ? `card:${source.cardId}`
        : `source:${source.title.trim().toLowerCase()}|${source.version ?? ''}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    suggestions.push(
      source.kind === 'knowledge_card'
        ? {
            kind: 'knowledge_card',
            cardId: source.cardId,
            title: source.title,
            excerpt: source.excerpt,
          }
        : {
            kind: 'cited_source',
            title: source.title,
            version: source.version,
            origin: source.origin,
            url: source.url,
            excerpt: source.excerpt,
          },
    );
  }
  return suggestions;
}

/** Enquanto os cartões revisados não entram: as fontes que as perguntas citaram. */
export class CitedSourceSuggestions implements StudySuggestionSource {
  async suggest(
    themes: readonly StudyTheme[],
  ): Promise<ReadonlyMap<string, ShiftReviewStudySuggestion[]>> {
    return new Map(
      themes.map((theme) => [theme.key, suggestionsFromCitedSources(theme.citedSources)]),
    );
  }
}
