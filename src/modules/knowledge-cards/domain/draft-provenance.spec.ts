import { describe, expect, it } from 'vitest';
import {
  describeCircularOrigin,
  findCircularOrigins,
  sourceContentSha256,
  type CardOrigin,
  type GoldCaseOrigin,
} from './draft-provenance';

const DRAFT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HASH_X = 'a'.repeat(64);
const HASH_Y = 'b'.repeat(64);

function gold(caseId: string, draftId: string, hash: string): GoldCaseOrigin {
  return { caseId, origin: { draftId, sourceContentSha256: hash } };
}

function card(cardId: string, draftId: string, hash: string, version = 1): CardOrigin {
  return { cardId, version, origin: { draftId, sourceContentSha256: hash } };
}

describe('sourceContentSha256', () => {
  it('não depende da ordem dos trechos nem de trecho repetido', () => {
    expect(sourceContentSha256(['trecho um', 'trecho dois'])).toBe(
      sourceContentSha256(['trecho dois', 'trecho um', 'trecho um']),
    );
  });

  it('não depende de acento, caixa e espaço', () => {
    expect(sourceContentSha256(['Punção  lombar adiada'])).toBe(
      sourceContentSha256(['puncao lombar ADIADA']),
    );
  });

  it('muda quando o conteúdo muda', () => {
    expect(sourceContentSha256(['ceftriaxona 2 g'])).not.toBe(
      sourceContentSha256(['ceftriaxona 1 g']),
    );
  });

  it('é um SHA-256 em hexadecimal', () => {
    expect(sourceContentSha256(['x'])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('findCircularOrigins (CC-412)', () => {
  it('acusa caso e cartão do mesmo rascunho', () => {
    expect(
      findCircularOrigins([gold('caso-1', DRAFT_A, HASH_X)], [card('c1', DRAFT_A, HASH_Y)]),
    ).toEqual([{ caseId: 'caso-1', cardId: 'c1', draftId: DRAFT_A, matchedBy: 'draft_id' }]);
  });

  it('acusa rascunhos diferentes com o mesmo conteúdo de origem', () => {
    expect(
      findCircularOrigins([gold('caso-1', DRAFT_A, HASH_X)], [card('c1', DRAFT_B, HASH_X)]),
    ).toEqual([{ caseId: 'caso-1', cardId: 'c1', draftId: DRAFT_B, matchedBy: 'source_content' }]);
  });

  it('não acusa origens diferentes', () => {
    expect(
      findCircularOrigins([gold('caso-1', DRAFT_A, HASH_X)], [card('c1', DRAFT_B, HASH_Y)]),
    ).toEqual([]);
  });

  it('compara id e hash sem caixa', () => {
    expect(
      findCircularOrigins(
        [gold('caso-1', DRAFT_A.toUpperCase(), HASH_X)],
        [card('c1', DRAFT_A, HASH_Y)],
      ),
    ).toHaveLength(1);
  });

  it('dá um resultado por par, preferindo o mesmo rascunho como motivo', () => {
    const circular = findCircularOrigins(
      [gold('caso-1', DRAFT_A, HASH_X)],
      [card('c1', DRAFT_B, HASH_X, 1), card('c1', DRAFT_A, HASH_Y, 2)],
    );
    expect(circular).toEqual([
      { caseId: 'caso-1', cardId: 'c1', draftId: DRAFT_A, matchedBy: 'draft_id' },
    ]);
  });

  it('descreve o par em uma linha', () => {
    expect(
      describeCircularOrigin({
        caseId: 'caso-1',
        cardId: 'c1',
        draftId: DRAFT_A,
        matchedBy: 'source_content',
      }),
    ).toBe(`caso caso-1 × cartão c1: mesmo conteúdo de origem do rascunho (${DRAFT_A})`);
  });
});
