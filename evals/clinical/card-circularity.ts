import type { PrismaClient } from '@prisma/client';
import {
  describeCircularOrigin,
  findCircularOrigins,
  type CardOrigin,
  type CircularOrigin,
  type GoldCaseOrigin,
} from '../../src/modules/knowledge-cards/domain/draft-provenance';
import type { ClinicalCase } from './case.schema';
import { CASE_SETS, loadCaseSet } from './cases';

/**
 * CC-412 — gabarito × cartões: nenhum caso do gabarito (conjunto principal e
 * prova cega) pode ter a mesma origem de rascunho de um cartão. Roda no
 * runner do gabarito, antes de medir, e em `pnpm cards:check-circularity`.
 */

export class CircularGoldCaseError extends Error {
  constructor(readonly circular: readonly CircularOrigin[]) {
    super(
      `${circular.length} caso(s) do gabarito com a mesma origem de um cartão (CC-412) — ` +
        `o gabarito mediria o Copiloto contra ele mesmo:\n${circular
          .map((item) => `  - ${describeCircularOrigin(item)}`)
          .join('\n')}`,
    );
  }
}

export function goldCaseOrigins(cases: readonly ClinicalCase[]): GoldCaseOrigin[] {
  return cases.flatMap((clinicalCase) =>
    clinicalCase.draftOrigin ? [{ caseId: clinicalCase.id, origin: clinicalCase.draftOrigin }] : [],
  );
}

/** Os dois conjuntos: a prova cega também é gabarito. */
export function loadGoldCaseOrigins(
  dirs: readonly string[] = Object.values(CASE_SETS),
): GoldCaseOrigin[] {
  return dirs.flatMap((dir) => goldCaseOrigins(loadCaseSet(dir).cases));
}

type CardVersionReader = Pick<PrismaClient, 'knowledgeCardVersion'>;

/** Toda versão de cartão que saiu de um rascunho de IA, em qualquer status — só leitura. */
export async function readCardOrigins(prisma: CardVersionReader): Promise<CardOrigin[]> {
  const versions = await prisma.knowledgeCardVersion.findMany({
    where: { draftId: { not: null } },
    select: {
      cardId: true,
      version: true,
      draft: { select: { id: true, sourceContentSha256: true } },
    },
  });
  return versions.flatMap((version) =>
    version.draft
      ? [
          {
            cardId: version.cardId,
            version: version.version,
            origin: {
              draftId: version.draft.id,
              sourceContentSha256: version.draft.sourceContentSha256,
            },
          },
        ]
      : [],
  );
}

export async function findCardCircularity(
  prisma: CardVersionReader,
  goldOrigins: readonly GoldCaseOrigin[] = loadGoldCaseOrigins(),
): Promise<CircularOrigin[]> {
  // Sem caso com rascunho de origem, não há o que cruzar: nem consulta o banco.
  if (goldOrigins.length === 0) return [];
  return findCircularOrigins(goldOrigins, await readCardOrigins(prisma));
}

export async function assertNoCircularGoldCases(
  prisma: CardVersionReader,
  goldOrigins?: readonly GoldCaseOrigin[],
): Promise<void> {
  const circular = await findCardCircularity(prisma, goldOrigins);
  if (circular.length > 0) throw new CircularGoldCaseError(circular);
}
