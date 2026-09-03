import { describe, it, expect } from 'vitest';
import {
  reciprocalRankFuse,
  applyInstitutionBoost,
  sortByScore,
  applyRelevanceFloor,
  INSTITUTION_RANK_BOOST,
  type SearchHit,
  type RetrievedChunk,
} from './hybrid-search';

describe('reciprocalRankFuse', () => {
  it('combines two result sets correctly', () => {
    const semantic: SearchHit[] = [
      { chunkId: 'a', score: 0.9, institutionId: null },
      { chunkId: 'b', score: 0.8, institutionId: null },
      { chunkId: 'c', score: 0.7, institutionId: null },
    ];
    const keyword: SearchHit[] = [
      { chunkId: 'b', score: 0.5, institutionId: null },
      { chunkId: 'd', score: 0.3, institutionId: null },
      { chunkId: 'a', score: 0.2, institutionId: null },
    ];

    const fused = reciprocalRankFuse(semantic, keyword);

    expect(fused.size).toBe(4);
    expect(fused.get('a')).toBeCloseTo(1 / 60 + 1 / 62);
    expect(fused.get('b')).toBeCloseTo(1 / 61 + 1 / 60);
    expect(fused.get('c')).toBeCloseTo(1 / 62);
    expect(fused.get('d')).toBeCloseTo(1 / 61);
  });

  it('handles empty inputs', () => {
    const fused = reciprocalRankFuse([], []);
    expect(fused.size).toBe(0);
  });

  it('handles single input', () => {
    const semantic: SearchHit[] = [{ chunkId: 'a', score: 0.9, institutionId: null }];
    const fused = reciprocalRankFuse(semantic, []);
    expect(fused.size).toBe(1);
    expect(fused.get('a')).toBeCloseTo(1 / 60);
  });
});

describe('applyInstitutionBoost', () => {
  const institutionA = 'institution-a';
  const institutionB = 'institution-b';

  it('boosts chunks matching the encounter institution', () => {
    const scores = new Map([
      ['global-chunk', 0.02],
      ['institutional-chunk', 0.018],
    ]);
    const chunkInstitutions = new Map<string, string | null>([
      ['global-chunk', null],
      ['institutional-chunk', institutionA],
    ]);

    const boosted = applyInstitutionBoost(scores, chunkInstitutions, institutionA);

    expect(boosted.get('institutional-chunk')).toBeCloseTo(0.018 + INSTITUTION_RANK_BOOST);
    expect(boosted.get('global-chunk')).toBe(0.02);
    expect(boosted.get('institutional-chunk')!).toBeGreaterThan(boosted.get('global-chunk')!);
  });

  it('does not boost chunks from a different institution', () => {
    const scores = new Map([['other-institution-chunk', 0.02]]);
    const chunkInstitutions = new Map<string, string | null>([
      ['other-institution-chunk', institutionB],
    ]);

    const boosted = applyInstitutionBoost(scores, chunkInstitutions, institutionA);

    expect(boosted.get('other-institution-chunk')).toBe(0.02);
  });

  it('returns scores unchanged when encounter has no institution', () => {
    const scores = new Map([['chunk', 0.02]]);
    const chunkInstitutions = new Map<string, string | null>([['chunk', institutionA]]);

    const boosted = applyInstitutionBoost(scores, chunkInstitutions, undefined);

    expect(boosted).toBe(scores);
  });
});

describe('sortByScore', () => {
  it('orders chunks by score descending', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'a',
        text: 'a',
        source: 's',
        sourceVersion: '1',
        specialty: 'card',
        evidenceLevel: null,
        institutionId: null,
        score: 0.5,
        metadata: {},
      },
      {
        id: 'b',
        text: 'b',
        source: 's',
        sourceVersion: '1',
        specialty: 'card',
        evidenceLevel: null,
        institutionId: null,
        score: 0.9,
        metadata: {},
      },
      {
        id: 'c',
        text: 'c',
        source: 's',
        sourceVersion: '1',
        specialty: 'card',
        evidenceLevel: null,
        institutionId: null,
        score: 0.7,
        metadata: {},
      },
    ];

    const sorted = sortByScore(chunks);

    expect(sorted[0]!.id).toBe('b');
    expect(sorted[1]!.id).toBe('c');
    expect(sorted[2]!.id).toBe('a');
  });

  it('handles empty array', () => {
    const sorted = sortByScore([]);
    expect(sorted).toEqual([]);
  });
});

/**
 * KB-005/KB-006 — Piso de relevância. Regressão dos dois casos reportados em
 * campo: quando o cenário real não existe na base, a busca devolvia os topK
 * chunks do cenário vizinho e o prompt os apresentava como fonte curada.
 */
describe('applyRelevanceFloor', () => {
  const thresholds = {
    minSemanticScore: 0.3,
    strongSemanticScore: 0.45,
    minKeywordRank: 0.01,
  };

  it('descarta chunks abaixo do piso e reporta cobertura "none" quando nenhum passa', () => {
    // Cenário do caso de dengue: só existem chunks de sepse na base, todos
    // semanticamente distantes do caso real.
    const result = applyRelevanceFloor(['sepse-1', 'sepse-2', 'choque-1'], {
      semanticScores: new Map([
        ['sepse-1', 0.24],
        ['sepse-2', 0.21],
        ['choque-1', 0.18],
      ]),
      keywordScores: new Map(),
      ...thresholds,
    });

    expect(result.keptChunkIds).toEqual([]);
    expect(result.coverage).toBe('none');
    expect(result.discardedCount).toBe(3);
    expect(result.bestSemanticScore).toBeCloseTo(0.24);
  });

  it('mantém apenas os chunks acima do piso quando a base cobre parcialmente', () => {
    const result = applyRelevanceFloor(['bom', 'fraco'], {
      semanticScores: new Map([
        ['bom', 0.38],
        ['fraco', 0.22],
      ]),
      keywordScores: new Map(),
      ...thresholds,
    });

    expect(result.keptChunkIds).toEqual(['bom']);
    // Passou do piso mas não do limiar "forte" — o prompt recebe o aviso de
    // encaixe fraco (ver WEAK_COVERAGE_WARNING em prompt-builder.ts).
    expect(result.coverage).toBe('partial');
    expect(result.discardedCount).toBe(1);
  });

  it('reporta cobertura "full" quando a melhor similaridade passa do limiar forte', () => {
    const result = applyRelevanceFloor(['otimo', 'bom'], {
      semanticScores: new Map([
        ['otimo', 0.62],
        ['bom', 0.41],
      ]),
      keywordScores: new Map(),
      ...thresholds,
    });

    expect(result.keptChunkIds).toEqual(['otimo', 'bom']);
    expect(result.coverage).toBe('full');
  });

  it('preserva a ordem de ranking dos chunks que sobrevivem', () => {
    const result = applyRelevanceFloor(['a', 'b', 'c'], {
      semanticScores: new Map([
        ['a', 0.5],
        ['b', 0.1],
        ['c', 0.35],
      ]),
      keywordScores: new Map(),
      ...thresholds,
    });

    expect(result.keptChunkIds).toEqual(['a', 'c']);
  });

  it('decide por ts_rank os chunks achados só pela busca lexical, sem score semântico', () => {
    const result = applyRelevanceFloor(['lexical-forte', 'lexical-fraco'], {
      semanticScores: new Map(),
      keywordScores: new Map([
        ['lexical-forte', 0.4],
        ['lexical-fraco', 0.001],
      ]),
      ...thresholds,
    });

    expect(result.keptChunkIds).toEqual(['lexical-forte']);
  });

  it('desliga o piso quando minSemanticScore é 0 — rollback por env sem redeploy', () => {
    const result = applyRelevanceFloor(['irrelevante'], {
      semanticScores: new Map([['irrelevante', 0.05]]),
      keywordScores: new Map(),
      ...thresholds,
      minSemanticScore: 0,
    });

    expect(result.keptChunkIds).toEqual(['irrelevante']);
    expect(result.coverage).toBe('full');
    expect(result.discardedCount).toBe(0);
  });
});
