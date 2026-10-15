import type { ContentProvenance } from '../provenance';

/**
 * Procedência do roteiro de Toxicologia (CC-323): o `toxData.ts` e a tela
 * `ToxPath.tsx` do ANY App v4, onde mora parte da conta (carvão, NAC,
 * atropina) e a regra da descontaminação.
 */
export const ANY_V4_TOX_SOURCE = 'ANY App v4 · toxData.ts e ToxPath.tsx (95c8fba)';

export const TOX_PATH_PROVENANCE: ContentProvenance = {
  source: ANY_V4_TOX_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

/**
 * Última linha do texto para o prontuário: de onde veio a sugestão e em que
 * pé está a revisão clínica, para o texto colado não parecer protocolo
 * revisado antes de ser.
 */
export function toxChartSourceLine(provenance: ContentProvenance = TOX_PATH_PROVENANCE): string {
  const review =
    provenance.review.status === 'revisado'
      ? `revisado por ${provenance.review.reviewer} em ${provenance.review.reviewedAt}`
      : 'revisão clínica pendente';
  return `Fonte: roteiro de Toxicologia do ANY App (conteúdo ${provenance.version}, ${review}).`;
}
