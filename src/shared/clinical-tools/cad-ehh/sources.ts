import type { ContentProvenance } from '../provenance';

/**
 * Procedência do roteiro de CAD e EHH (CC-326). O ANY traz no rodapé
 * "KetoPath v1.0.0 · Agosto 2026" e diz que o conteúdo vem da spec
 * `ketopath-spec.md` v1.0.0, que não está no repositório do ANY.
 */
export const CAD_EHH_PROVENANCE: ContentProvenance = {
  source:
    'ANY App v4 · KetoPath (ketoData.ts, ketoCalc.ts e telas, 95c8fba), spec ketopath-spec.md v1.0.0',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

/** Marca de fonte no fim dos textos: [ADA], [UTD], [JBDS] ou [LIT: …]. */
const SOURCE_TAG = /\s*\[(?:ADA|UTD|JBDS|LIT[^\]]*)\]/g;

/**
 * Texto sem a marca de fonte, como a tela do ANY mostra (`semFonte`). A marca
 * continua no dado, para a rastreabilidade; a atribuição pública (licença CC
 * BY 4.0 do consenso ADA) fica na lista de referências.
 */
export function stripSourceTags(text: string): string {
  return text
    .replace(SOURCE_TAG, '')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}
