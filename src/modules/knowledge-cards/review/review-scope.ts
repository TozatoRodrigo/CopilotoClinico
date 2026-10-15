import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../config/prisma.service';

/**
 * ADR-009 — o revisor vê os cartões globais (`institution_id` nulo) e os das
 * instituições a que está vinculado. Cartão institucional de outra casa não
 * aparece na fila e responde como inexistente.
 */
export function reviewScopeWhere(
  institutionIds: readonly string[],
): Prisma.KnowledgeCardWhereInput {
  if (institutionIds.length === 0) return { institutionId: null };
  return { OR: [{ institutionId: null }, { institutionId: { in: [...institutionIds] } }] };
}

export async function loadReviewerScope(
  prisma: PrismaService,
  reviewerId: string,
): Promise<Prisma.KnowledgeCardWhereInput> {
  const links = await prisma.physicianInstitution.findMany({
    where: { physicianId: reviewerId },
    select: { institutionId: true },
  });
  return reviewScopeWhere(links.map((link) => link.institutionId));
}

/**
 * CC-411 — revisões cruzadas que este médico pode fazer agora: pendentes, de
 * cartão no escopo dele e ainda publicado com a versão sorteada (correção em
 * andamento espera a decisão dela), e de versão que ele não aprovou nem
 * escreveu. `version_author_id` nulo (a IA escreveu) não exclui ninguém.
 */
export function availableCrossReviewWhere(
  reviewerId: string,
  scope: Prisma.KnowledgeCardWhereInput,
): Prisma.KnowledgeCardCrossReviewWhereInput {
  return {
    status: 'pending',
    firstReviewerId: { not: reviewerId },
    OR: [{ versionAuthorId: null }, { versionAuthorId: { not: reviewerId } }],
    card: { AND: [scope, { status: 'published' }] },
    version: { publishedOf: { isNot: null } },
  };
}
