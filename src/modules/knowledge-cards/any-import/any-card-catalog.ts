import type { AnyCardToolId } from '../../../shared/contracts/knowledge-cards';
import {
  anyCardSourceMeta,
  anyCardSourceText,
  type AnyCardDraft,
  type AnyToolSourceMeta,
} from './any-card-draft';
import { airwayDrafts, sedationDrafts } from './mappers/airway-sedation';
import { cadDrafts, dengueDrafts } from './mappers/dengue-cad';
import { infusionDrafts } from './mappers/infusions';
import { aclsDrafts, palliativeDrafts } from './mappers/palliative-acls';
import { pediatricDrafts } from './mappers/pediatrics';
import { blockDrafts, toxicologyDrafts } from './mappers/toxicology-blocks';

/**
 * CC-405 — catálogo dos rascunhos de cartão do ANY: o conteúdo tipado de cada
 * ferramenta (src/shared/clinical-tools) mapeado para cartão, na ordem das
 * ferramentas. É função pura do motor: o mesmo código dá os mesmos
 * rascunhos, e é daqui que o servidor resolve a fonte `clinical_tool` de um
 * cartão (o texto que as citações conferem).
 */

const MAPPERS: Record<AnyCardToolId, () => AnyCardDraft[]> = {
  infusoes: infusionDrafts,
  pediatria: pediatricDrafts,
  'via-aerea': airwayDrafts,
  sedacao: sedationDrafts,
  toxicologia: toxicologyDrafts,
  bloqueios: blockDrafts,
  paliativos: palliativeDrafts,
  acls: aclsDrafts,
  dengue: dengueDrafts,
  'cad-ehh': cadDrafts,
};

let catalog: ReadonlyMap<string, AnyCardDraft> | null = null;

/** Todos os rascunhos, por `itemId`. Montado uma vez: o motor não muda com o processo no ar. */
function draftsById(): ReadonlyMap<string, AnyCardDraft> {
  if (catalog) return catalog;
  const byId = new Map<string, AnyCardDraft>();
  for (const [toolId, mapper] of Object.entries(MAPPERS)) {
    for (const draft of mapper()) {
      if (draft.toolId !== toolId || !draft.itemId.startsWith(`${toolId}/`)) {
        throw new Error(`Rascunho ${draft.itemId} fora da ferramenta ${toolId}`);
      }
      if (byId.has(draft.itemId)) throw new Error(`Item do ANY repetido: ${draft.itemId}`);
      byId.set(draft.itemId, draft);
    }
  }
  catalog = byId;
  return byId;
}

export function anyCardDrafts(toolId?: AnyCardToolId | null): AnyCardDraft[] {
  const drafts = [...draftsById().values()];
  return toolId ? drafts.filter((draft) => draft.toolId === toolId) : drafts;
}

export interface ResolvedToolSource {
  meta: AnyToolSourceMeta;
  text: string;
}

/**
 * A fonte `clinical_tool` de um cartão, resolvida pelo código do motor que
 * está no ar; `undefined` quando o item não existe mais (o conteúdo mudou de
 * id ou saiu do motor).
 */
export function resolveToolSource(toolItemId: string): ResolvedToolSource | undefined {
  const draft = draftsById().get(toolItemId);
  return draft ? { meta: anyCardSourceMeta(draft), text: anyCardSourceText(draft) } : undefined;
}
