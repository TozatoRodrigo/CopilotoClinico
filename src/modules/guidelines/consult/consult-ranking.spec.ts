import { describe, expect, it } from 'vitest';
import { rankConsultResults, type ConsultCandidate } from './consult-ranking';

function candidate(overrides: Partial<ConsultCandidate> & { chunkId: string }): ConsultCandidate {
  return {
    source: 'PCDT — Acidentes Escorpiônicos',
    sourceVersion: 'Portaria SECTICS/MS nº 59 - 01/08/2025',
    specialty: 'toxicologia',
    text: 'texto',
    status: 'official_unreviewed',
    institutionId: null,
    metadata: {
      documentKey: 'pcdt:acidentes-escorpionicos',
      section: '4. DIAGNÓSTICO',
      url: 'https://www.gov.br/conitec/escorpionicos.pdf',
    },
    similarity: 0.6,
    ...overrides,
  };
}

describe('rankConsultResults', () => {
  it('devolve a base oficial com seção, link do PDF e origem', () => {
    const [result] = rankConsultResults([candidate({ chunkId: 'a' })], []);

    expect(result).toEqual({
      chunkId: 'a',
      source: 'PCDT — Acidentes Escorpiônicos',
      sourceVersion: 'Portaria SECTICS/MS nº 59 - 01/08/2025',
      section: '4. DIAGNÓSTICO',
      text: 'texto',
      origin: 'official_unreviewed',
      documentUrl: 'https://www.gov.br/conitec/escorpionicos.pdf',
      specialty: 'toxicologia',
      similarity: 0.6,
      matchedBy: 'semantic',
    });
  });

  it('base curada: origem pública ou institucional, sem seção nem PDF', () => {
    const results = rankConsultResults(
      [
        candidate({
          chunkId: 'pub',
          status: 'approved',
          source: 'IBCC — Anaphylaxis',
          metadata: {},
        }),
        candidate({
          chunkId: 'inst',
          status: 'approved',
          source: 'Protocolo HC',
          institutionId: 'i1',
          metadata: {},
        }),
      ],
      [],
    );

    expect(results.map((r) => [r.chunkId, r.origin, r.section, r.documentUrl])).toEqual([
      ['pub', 'public', null, null],
      ['inst', 'institutional', null, null],
    ]);
  });

  it('corta o vizinho semântico fraco, mas mantém quem casou por palavra-chave', () => {
    const weak = candidate({ chunkId: 'fraco', similarity: 0.4, metadata: { documentKey: 'x' } });
    const exact = candidate({ chunkId: 'termo', similarity: 0.3, metadata: { documentKey: 'y' } });

    const results = rankConsultResults([weak], [exact]);

    expect(results.map((r) => [r.chunkId, r.matchedBy])).toEqual([['termo', 'keyword']]);
  });

  it('quem casa nas duas buscas sobe no ranking', () => {
    const results = rankConsultResults(
      [
        candidate({ chunkId: 'so-semantica', similarity: 0.62, metadata: { documentKey: 'a' } }),
        candidate({ chunkId: 'ambas', similarity: 0.6, metadata: { documentKey: 'b' } }),
      ],
      [candidate({ chunkId: 'ambas', similarity: 0.6, metadata: { documentKey: 'b' } })],
    );

    expect(results.map((r) => [r.chunkId, r.matchedBy])).toEqual([
      ['ambas', 'both'],
      ['so-semantica', 'semantic'],
    ]);
  });

  it('no máximo dois trechos por documento, e respeita o limite', () => {
    const many = ['a', 'b', 'c'].map((id, i) =>
      candidate({ chunkId: id, similarity: 0.7 - i * 0.01 }),
    );
    const other = candidate({ chunkId: 'd', similarity: 0.5, metadata: { documentKey: 'outro' } });

    const results = rankConsultResults([...many, other], [], {
      minSimilarity: 0.45,
      keywordBoost: 0.05,
      maxPerDocument: 2,
      limit: 3,
    });

    expect(results.map((r) => r.chunkId)).toEqual(['a', 'b', 'd']);
  });
});
