import { describe, expect, it } from 'vitest';
import type { ShiftReviewStoredSource } from './review-material';
import { CitedSourceSuggestions, suggestionsFromCitedSources } from './study-suggestions';

function citation(
  title: string,
  overrides: Partial<Extract<ShiftReviewStoredSource, { kind: 'analysis_citation' }>> = {},
): ShiftReviewStoredSource {
  return {
    kind: 'analysis_citation',
    chunkId: `chunk-${title}`,
    title,
    version: '2024',
    origin: 'official_unreviewed',
    url: 'https://example.org/diretriz.pdf',
    excerpt: `Trecho de ${title}`,
    ...overrides,
  };
}

const card: ShiftReviewStoredSource = {
  kind: 'knowledge_card',
  cardId: '70000000-0000-4000-8000-000000000001',
  versionId: '70000000-0000-4000-8000-000000000002',
  title: 'Cefaleia em trovoada',
  version: null,
  origin: null,
  url: null,
  excerpt: 'TC sem contraste é o exame inicial.',
};

describe('suggestionsFromCitedSources', () => {
  it('turns the cited sources into suggestions, without the internal chunk id', () => {
    expect(suggestionsFromCitedSources([citation('Diretriz de cefaleia')])).toEqual([
      {
        kind: 'cited_source',
        title: 'Diretriz de cefaleia',
        version: '2024',
        origin: 'official_unreviewed',
        url: 'https://example.org/diretriz.pdf',
        excerpt: 'Trecho de Diretriz de cefaleia',
      },
    ]);
  });

  it('suggests each document once, keeping the first excerpt', () => {
    const suggestions = suggestionsFromCitedSources([
      citation('Diretriz de cefaleia', { chunkId: 'a', excerpt: 'Primeiro trecho' }),
      citation('diretriz de cefaleia ', { chunkId: 'b', excerpt: 'Outro trecho' }),
      citation('Diretriz de cefaleia', { chunkId: 'c', version: '2025' }),
    ]);

    expect(suggestions.map((suggestion) => suggestion.excerpt)).toEqual([
      'Primeiro trecho',
      'Trecho de Diretriz de cefaleia',
    ]);
  });

  it('keeps the reviewed card as a card', () => {
    expect(suggestionsFromCitedSources([card, card])).toEqual([
      {
        kind: 'knowledge_card',
        cardId: card.kind === 'knowledge_card' ? card.cardId : '',
        title: 'Cefaleia em trovoada',
        excerpt: 'TC sem contraste é o exame inicial.',
      },
    ]);
  });

  it('stops at the limit', () => {
    const sources = ['A', 'B', 'C', 'D'].map((title) => citation(title));

    expect(suggestionsFromCitedSources(sources)).toHaveLength(3);
    expect(suggestionsFromCitedSources(sources, 1)).toHaveLength(1);
  });
});

describe('CitedSourceSuggestions', () => {
  it('answers every theme by its key', async () => {
    const suggestions = await new CitedSourceSuggestions().suggest([
      { key: 'syndrome:cefaleia', syndrome: 'cefaleia', topics: [], citedSources: [card] },
      { key: 'topic:hipercalemia', syndrome: null, topics: ['Hipercalemia'], citedSources: [] },
    ]);

    expect(suggestions.get('syndrome:cefaleia')).toHaveLength(1);
    expect(suggestions.get('topic:hipercalemia')).toEqual([]);
  });
});
