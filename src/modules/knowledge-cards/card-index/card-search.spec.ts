import { describe, expect, it } from 'vitest';
import { distinctCardQueries, mergeCardHits, toVectorLiteral } from './card-search';

describe('mergeCardHits (CC-406)', () => {
  it('fica com a melhor similaridade de cada cartão e as consultas que o acharam', () => {
    const merged = mergeCardHits([
      [
        { cardId: 'a', versionId: 'va', similarity: 0.62 },
        { cardId: 'b', versionId: 'vb', similarity: 0.41 },
      ],
      [
        { cardId: 'b', versionId: 'vb', similarity: 0.71 },
        { cardId: 'c', versionId: 'vc', similarity: 0.3 },
      ],
    ]);

    expect(merged).toEqual([
      { cardId: 'b', versionId: 'vb', similarity: 0.71, queryIndexes: [0, 1] },
      { cardId: 'a', versionId: 'va', similarity: 0.62, queryIndexes: [0] },
      { cardId: 'c', versionId: 'vc', similarity: 0.3, queryIndexes: [1] },
    ]);
  });

  it('não soma: o cartão genérico achado por toda consulta não passa à frente', () => {
    const merged = mergeCardHits([
      [{ cardId: 'generico', versionId: 'v', similarity: 0.5 }],
      [{ cardId: 'generico', versionId: 'v', similarity: 0.5 }],
      [{ cardId: 'especifico', versionId: 'v2', similarity: 0.6 }],
    ]);

    expect(merged.map((hit) => hit.cardId)).toEqual(['especifico', 'generico']);
  });

  it('sem consultas, sem cartões', () => {
    expect(mergeCardHits([])).toEqual([]);
  });
});

describe('distinctCardQueries (CC-406)', () => {
  it('tira vazias e repetidas sem caixa, mantendo a ordem', () => {
    expect(
      distinctCardQueries(['  Meningite bacteriana ', '', 'meningite bacteriana', 'Sepse']),
    ).toEqual(['Meningite bacteriana', 'Sepse']);
  });
});

describe('toVectorLiteral', () => {
  it('escreve o vetor no formato do pgvector', () => {
    expect(toVectorLiteral([0.1, -0.2, 3])).toBe('[0.1,-0.2,3]');
  });
});
