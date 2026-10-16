import { InstitutionStatus } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';

/**
 * CC-019 — quem vê conteúdo institucional (ADR-009).
 *
 * Diretriz ou protocolo global (`institutionId` nulo) é de todos. O
 * institucional só aparece para quem tem vínculo ativo com a instituição: o
 * vínculo existe e a instituição está `active`. Papel (ADMIN, COMPLIANCE) não
 * amplia o que se vê nas rotas de leitura do médico; a curadoria tem rotas
 * próprias (ADR-008).
 *
 * Função sobre o Prisma, e não só método de serviço, para o orquestrador e o
 * motor de protocolos aplicarem a mesma regra sem mudar a injeção deles.
 */
export type InstitutionLinksReader = Pick<PrismaService, 'physicianInstitution'>;

export async function activeInstitutionIds(
  prisma: InstitutionLinksReader,
  physicianId: string,
): Promise<string[]> {
  const links = await prisma.physicianInstitution.findMany({
    where: { physicianId, institution: { status: InstitutionStatus.active } },
    select: { institutionId: true },
    orderBy: { createdAt: 'asc' },
  });
  return links.map((link) => link.institutionId);
}

export function isVisibleToInstitutions(
  contentInstitutionId: string | null,
  institutionIds: readonly string[],
): boolean {
  return contentInstitutionId === null || institutionIds.includes(contentInstitutionId);
}
