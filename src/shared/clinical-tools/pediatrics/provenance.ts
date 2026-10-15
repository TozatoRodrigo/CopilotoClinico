import type { ContentProvenance } from '../provenance';

/**
 * Procedência do conteúdo pediátrico (ADR-017, CC-319 a CC-321).
 *
 * As doses vêm do PedGuide do ANY App v4, que é o que o ANY mostra hoje. O
 * ANY tem outras três fontes pediátricas que divergem entre si (HETRIN Ped
 * v1.1.7 e v1.2.0 e o §17 do CLAUDE.md); a reconciliação por id de droga está
 * em docs/ferramentas/revisao-clinica/pediatria-fonte-unica.md e espera a
 * assinatura do Dr. Gustavo Moreira (CC-321). Quando ele assinar, troca-se o
 * dado e a revisão abaixo; o motor e a tela não mudam.
 */

export const PEDGUIDE_V4_SOURCE = 'ANY App v4 · PedGuide.tsx (95c8fba)';

export const PEDIATRIC_DOSES_PROVENANCE: ContentProvenance = {
  source: PEDGUIDE_V4_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  // CC-321: fica pendente até a fonte única ser assinada.
  review: { status: 'pendente' },
};

export const CANONICAL_SOURCE_NOTICE = 'Doses aguardando assinatura da fonte única (CC-321).';

/**
 * A tela avisa enquanto a fonte das doses não estiver assinada. Depende só do
 * dado: assinada a fonte (revisão `revisado`), o aviso some sem mexer na tela.
 */
export function awaitsCanonicalSource(provenance: ContentProvenance): boolean {
  return provenance.review.status === 'pendente';
}
