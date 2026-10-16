import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  assertNoCircularGoldCases,
  CircularGoldCaseError,
  findCardCircularity,
  goldCaseOrigins,
  loadGoldCaseOrigins,
  readCardOrigins,
} from './card-circularity';
import { strokeCaseFixture } from './case-fixture';

const DRAFT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HASH_X = 'a'.repeat(64);
const HASH_Y = 'b'.repeat(64);

function prismaWith(
  versions: Array<{
    cardId: string;
    version: number;
    draft: { id: string; sourceContentSha256: string } | null;
  }>,
) {
  const findMany = vi.fn().mockResolvedValue(versions);
  return {
    prisma: { knowledgeCardVersion: { findMany } } as unknown as Pick<
      PrismaClient,
      'knowledgeCardVersion'
    >,
    findMany,
  };
}

describe('goldCaseOrigins', () => {
  it('pega só os casos com rascunho de origem registrado', () => {
    const withOrigin = strokeCaseFixture({
      id: 'caso-com-rascunho',
      draftOrigin: { draftId: DRAFT_A, sourceContentSha256: HASH_X },
    });

    expect(goldCaseOrigins([strokeCaseFixture(), withOrigin])).toEqual([
      { caseId: 'caso-com-rascunho', origin: { draftId: DRAFT_A, sourceContentSha256: HASH_X } },
    ]);
  });

  it('o gabarito atual não registra rascunho de origem em nenhum caso', () => {
    expect(loadGoldCaseOrigins()).toEqual([]);
  });
});

describe('readCardOrigins', () => {
  it('lê só versões que saíram de rascunho de IA', async () => {
    const { prisma, findMany } = prismaWith([
      { cardId: 'c1', version: 1, draft: { id: DRAFT_A, sourceContentSha256: HASH_X } },
      { cardId: 'c1', version: 2, draft: null },
    ]);

    expect(await readCardOrigins(prisma)).toEqual([
      { cardId: 'c1', version: 1, origin: { draftId: DRAFT_A, sourceContentSha256: HASH_X } },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { draftId: { not: null } } }),
    );
  });
});

describe('findCardCircularity (CC-412)', () => {
  it('nem consulta o banco quando nenhum caso registra rascunho de origem', async () => {
    const { prisma, findMany } = prismaWith([]);

    expect(await findCardCircularity(prisma, [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('acusa caso e cartão do mesmo rascunho ou do mesmo conteúdo de origem', async () => {
    const { prisma } = prismaWith([
      { cardId: 'c1', version: 1, draft: { id: DRAFT_A, sourceContentSha256: HASH_Y } },
      { cardId: 'c2', version: 1, draft: { id: DRAFT_B, sourceContentSha256: HASH_X } },
    ]);

    const circular = await findCardCircularity(prisma, [
      { caseId: 'caso-1', origin: { draftId: DRAFT_A, sourceContentSha256: 'c'.repeat(64) } },
      {
        caseId: 'caso-2',
        origin: { draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', sourceContentSha256: HASH_X },
      },
    ]);

    expect(circular).toEqual([
      { caseId: 'caso-1', cardId: 'c1', draftId: DRAFT_A, matchedBy: 'draft_id' },
      { caseId: 'caso-2', cardId: 'c2', draftId: DRAFT_B, matchedBy: 'source_content' },
    ]);
  });

  it('falha com a lista dos pares circulares', async () => {
    const { prisma } = prismaWith([
      { cardId: 'c1', version: 1, draft: { id: DRAFT_A, sourceContentSha256: HASH_X } },
    ]);
    const goldOrigins = [
      { caseId: 'caso-1', origin: { draftId: DRAFT_A, sourceContentSha256: HASH_Y } },
    ];

    const error = await assertNoCircularGoldCases(prisma, goldOrigins).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(CircularGoldCaseError);
    expect((error as Error).message).toContain(
      `caso caso-1 × cartão c1: mesmo rascunho (${DRAFT_A})`,
    );
  });

  it('passa quando as origens não se cruzam', async () => {
    const { prisma } = prismaWith([
      { cardId: 'c1', version: 1, draft: { id: DRAFT_B, sourceContentSha256: HASH_Y } },
    ]);

    await expect(
      assertNoCircularGoldCases(prisma, [
        { caseId: 'caso-1', origin: { draftId: DRAFT_A, sourceContentSha256: HASH_X } },
      ]),
    ).resolves.toBeUndefined();
  });
});
