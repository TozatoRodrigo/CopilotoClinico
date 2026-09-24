import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFICIAL_CHRONIC_PENALTY,
  DEFAULT_OFFICIAL_MAX_PER_DOCUMENT,
  DEFAULT_OFFICIAL_MIN_SEMANTIC_SCORE,
  DEFAULT_OFFICIAL_TOP_K,
  selectOfficialChunks,
  type OfficialHit,
} from './official-search';

const options = {
  minSemanticScore: DEFAULT_OFFICIAL_MIN_SEMANTIC_SCORE,
  chronicPenalty: DEFAULT_OFFICIAL_CHRONIC_PENALTY,
  maxPerDocument: DEFAULT_OFFICIAL_MAX_PER_DOCUMENT,
  topK: DEFAULT_OFFICIAL_TOP_K,
};

function hit(
  chunkId: string,
  similarity: number,
  documentId: string,
  careSetting: OfficialHit['careSetting'] = 'agudo',
): OfficialHit {
  return { chunkId, similarity, documentId, careSetting };
}

const ids = (hits: Array<{ chunkId: string }>) => hits.map((h) => h.chunkId);

describe('selectOfficialChunks', () => {
  it('descarta abaixo do piso e reporta a melhor similaridade bruta', () => {
    const result = selectOfficialChunks([hit('a', 0.5, 'd1'), hit('b', 0.2, 'd2')], options);

    expect(ids(result.selected)).toEqual(['a']);
    expect(result.bestSemanticScore).toBe(0.5);
    expect(result.discardedByFloor).toBe(1);
  });

  it('não devolve nada quando nenhum trecho passa — a base oficial não cobre o caso', () => {
    const result = selectOfficialChunks([hit('a', 0.3, 'd1'), hit('b', 0.1, 'd2')], options);

    expect(result.selected).toEqual([]);
  });

  it('PCDT crônico precisa de encaixe claramente melhor que um agudo', () => {
    // Caso de crise hipertensiva: o PCDT de HAS ambulatorial é vizinho próximo.
    const result = selectOfficialChunks(
      [hit('has-ambulatorial', 0.52, 'has', 'cronico'), hit('avc-agudo', 0.5, 'avc', 'agudo')],
      options,
    );

    expect(ids(result.selected)).toEqual(['avc-agudo', 'has-ambulatorial']);
    expect(result.selected[1]!.effectiveScore).toBeCloseTo(0.47);
  });

  it('a penalização pode tirar um crônico que passaria no piso', () => {
    const result = selectOfficialChunks([hit('dpoc', 0.38, 'dpoc', 'cronico')], options);

    expect(result.selected).toEqual([]);
    expect(result.discardedByFloor).toBe(1);
  });

  it('misto e indefinido não são penalizados', () => {
    const result = selectOfficialChunks(
      [hit('asma', 0.36, 'asma', 'misto'), hit('x', 0.36, 'x', 'indefinido')],
      options,
    );

    expect(ids(result.selected)).toEqual(['asma', 'x']);
  });

  it('no máximo dois trechos do mesmo documento', () => {
    const result = selectOfficialChunks(
      [
        hit('a1', 0.7, 'ofidicos'),
        hit('a2', 0.69, 'ofidicos'),
        hit('a3', 0.68, 'ofidicos'),
        hit('b1', 0.5, 'escorpionicos'),
      ],
      options,
    );

    expect(ids(result.selected)).toEqual(['a1', 'a2', 'b1']);
  });

  it('respeita o teto por análise', () => {
    const result = selectOfficialChunks(
      [hit('a', 0.6, 'd1'), hit('b', 0.59, 'd2'), hit('c', 0.58, 'd3'), hit('d', 0.57, 'd4')],
      options,
    );

    expect(ids(result.selected)).toEqual(['a', 'b', 'c']);
  });
});
