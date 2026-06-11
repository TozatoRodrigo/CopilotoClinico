import { describe, it, expect } from 'vitest';
import {
  reciprocalRankFuse,
  applyInstitutionBoost,
  sortByScore,
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
