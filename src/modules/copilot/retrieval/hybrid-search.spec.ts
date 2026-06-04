import { describe, it, expect } from 'vitest';
import {
  reciprocalRankFuse,
  sortByScore,
  type SearchHit,
  type RetrievedChunk,
} from './hybrid-search';

describe('reciprocalRankFuse', () => {
  it('combines two result sets correctly', () => {
    const semantic: SearchHit[] = [
      { chunkId: 'a', score: 0.9 },
      { chunkId: 'b', score: 0.8 },
      { chunkId: 'c', score: 0.7 },
    ];
    const keyword: SearchHit[] = [
      { chunkId: 'b', score: 0.5 },
      { chunkId: 'd', score: 0.3 },
      { chunkId: 'a', score: 0.2 },
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
    const semantic: SearchHit[] = [{ chunkId: 'a', score: 0.9 }];
    const fused = reciprocalRankFuse(semantic, []);
    expect(fused.size).toBe(1);
    expect(fused.get('a')).toBeCloseTo(1 / 60);
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
