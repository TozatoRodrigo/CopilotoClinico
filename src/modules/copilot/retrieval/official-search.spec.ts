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

/**
 * Pontuações reais medidas em produção em 24/09/2026 (text-embedding-3-small,
 * base oficial completa). Se os defaults mudarem, estes casos dizem o que a
 * mudança faz com eles.
 */
describe('selectOfficialChunks — casos de calibração de produção', () => {
  it('picada de cobra: mantém os PCDTs de acidentes com animais peçonhentos', () => {
    const result = selectOfficialChunks(
      [
        hit('ofidico-diag', 0.6, 'ofidicos'),
        hit('ofidico-monit', 0.573, 'ofidicos'),
        hit('escorp-diag', 0.56, 'escorpionicos'),
      ],
      options,
    );

    expect(ids(result.selected)).toEqual(['ofidico-diag', 'ofidico-monit', 'escorp-diag']);
  });

  it('crise hipertensiva: o PCDT de HAS ambulatorial não entra', () => {
    // 0,598 bruto − 0,10 = 0,498, abaixo do piso. Com a penalização antiga
    // (0,05) ficava em 0,548 e entrava.
    const result = selectOfficialChunks([hit('has-diag', 0.598, 'has', 'cronico')], options);

    expect(result.selected).toEqual([]);
    expect(result.discardedByFloor).toBe(1);
  });

  it('AVC: o PCDT de AVC isquêmico agudo entra', () => {
    const result = selectOfficialChunks([hit('avc-diag', 0.553, 'avc')], options);

    expect(ids(result.selected)).toEqual(['avc-diag']);
  });

  it('dengue: o ruído de baixa similaridade não entra', () => {
    const result = selectOfficialChunks(
      [
        hit('agrotoxicos', 0.451, 'agrotoxicos-cap4'),
        hit('chagas', 0.451, 'chagas', 'misto'),
        hit('falciforme', 0.442, 'falciforme', 'misto'),
      ],
      options,
    );

    expect(result.selected).toEqual([]);
    expect(result.bestSemanticScore).toBe(0.451);
  });

  it('limite conhecido: documento misto entre 0,52 e 0,54 ainda passa', () => {
    // Registrado de propósito: é o ruído que sobrou na calibração (Chagas na
    // crise hipertensiva). Quando o passo 8 recalibrar, este teste deve mudar.
    const result = selectOfficialChunks([hit('chagas', 0.527, 'chagas', 'misto')], options);

    expect(ids(result.selected)).toEqual(['chagas']);
  });
});

describe('selectOfficialChunks — regras', () => {
  it('só documento crônico é penalizado', () => {
    const result = selectOfficialChunks(
      [
        hit('agudo', 0.55, 'a', 'agudo'),
        hit('misto', 0.55, 'b', 'misto'),
        hit('indefinido', 0.55, 'c', 'indefinido'),
        hit('cronico', 0.55, 'd', 'cronico'),
      ],
      { ...options, topK: 10 },
    );

    expect(ids(result.selected)).toEqual(['agudo', 'misto', 'indefinido']);
  });

  it('ordena pela similaridade efetiva, não pela bruta', () => {
    const result = selectOfficialChunks(
      [hit('cronico', 0.7, 'd1', 'cronico'), hit('agudo', 0.65, 'd2', 'agudo')],
      options,
    );

    expect(ids(result.selected)).toEqual(['agudo', 'cronico']);
    expect(result.selected[1]!.effectiveScore).toBeCloseTo(0.6);
  });

  it('no máximo dois trechos do mesmo documento', () => {
    const result = selectOfficialChunks(
      [
        hit('a1', 0.7, 'ofidicos'),
        hit('a2', 0.69, 'ofidicos'),
        hit('a3', 0.68, 'ofidicos'),
        hit('b1', 0.6, 'escorpionicos'),
      ],
      options,
    );

    expect(ids(result.selected)).toEqual(['a1', 'a2', 'b1']);
  });

  it('respeita o teto por análise', () => {
    const result = selectOfficialChunks(
      [hit('a', 0.7, 'd1'), hit('b', 0.69, 'd2'), hit('c', 0.68, 'd3'), hit('d', 0.67, 'd4')],
      options,
    );

    expect(ids(result.selected)).toEqual(['a', 'b', 'c']);
  });

  it('limiares vêm das opções, não dos defaults', () => {
    const result = selectOfficialChunks([hit('a', 0.4, 'd1')], {
      ...options,
      minSemanticScore: 0.3,
    });

    expect(ids(result.selected)).toEqual(['a']);
  });
});
