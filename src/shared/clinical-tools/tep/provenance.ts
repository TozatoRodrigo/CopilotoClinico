import type { ContentProvenance } from '../provenance';

/** Roteiro e calculadoras do TEP portados do `TepGuide.tsx` do ANY App v4 (CC-318). */
export const ANY_V4_TEP_SOURCE = 'ANY App v4 · TepGuide.tsx (95c8fba)';

/**
 * Procedência comum ao roteiro e às calculadoras do TEP. A referência de
 * diretriz fica de fora de propósito: o ANY diz "AHA/ACC 2026" no topo e
 * "ESC 2019" no rodapé, e a escolha é da revisão clínica (CC-310; ver
 * docs/ferramentas/revisao-clinica/tep.md).
 */
export const TEP_PROVENANCE: ContentProvenance = {
  source: ANY_V4_TEP_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};
