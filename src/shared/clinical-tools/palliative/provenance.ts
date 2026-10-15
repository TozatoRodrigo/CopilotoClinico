import type { ContentProvenance } from '../provenance';

/** Nome da ferramenta na tela e no prontuário. */
export const PALLIATIVE_TOOL_NAME = 'Cuidados paliativos no PS';

/**
 * Procedência do roteiro de cuidados paliativos (CC-329): o PaliaPath do ANY
 * App v4, com o dado do `paliaData.ts` e os textos e contas que moravam na
 * própria tela (`PaliaPath.tsx`). Toda mudança clínica decidida na revisão
 * (docs/ferramentas/revisao-clinica/paliativos.md) sobe a versão.
 */
export const PALLIATIVE_PROVENANCE: ContentProvenance = {
  source: 'ANY App v4 · paliaData.ts e PaliaPath.tsx (95c8fba)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};
