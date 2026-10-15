import type { Prisma } from '@prisma/client';

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
