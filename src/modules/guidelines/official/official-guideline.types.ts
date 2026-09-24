import type { CareSetting, OfficialGuidelineKind } from '@prisma/client';

/**
 * ADR-010 — As quatro listas da Conitec. `minItems` é o piso de itens
 * reconhecidos abaixo do qual o coletor aborta: uma queda brusca quase sempre
 * é mudança no HTML da página, não 100 protocolos revogados de uma vez.
 * Contagens em 24/09/2026: PCDT 132, DDT 16, DB 22, PU 20.
 */
export interface ConitecListingSource {
  kind: OfficialGuidelineKind;
  label: string;
  url: string;
  minItems: number;
}

const CONITEC_BASE =
  'https://www.gov.br/conitec/pt-br/assuntos/avaliacao-de-tecnologias-em-saude/protocolos-clinicos-e-diretrizes-terapeuticas';

export const CONITEC_LISTINGS: readonly ConitecListingSource[] = [
  { kind: 'pcdt', label: 'PCDT', url: `${CONITEC_BASE}/pcdt`, minItems: 100 },
  { kind: 'ddt', label: 'DDT', url: `${CONITEC_BASE}/ddt`, minItems: 12 },
  {
    kind: 'diretriz_brasileira',
    label: 'Diretriz Brasileira',
    url: `${CONITEC_BASE}/diretrizes-brasileiras-db`,
    minItems: 15,
  },
  {
    kind: 'protocolo_uso',
    label: 'Protocolo de Uso',
    url: `${CONITEC_BASE}/protocolos-de-uso-pu`,
    minItems: 15,
  },
] as const;

export const CONITEC_ORIGIN = 'https://www.gov.br';

/** Um documento como aparece numa linha da lista da Conitec. */
export interface ConitecListingItem {
  kind: OfficialGuidelineKind;
  /** Estável entre versões: `<kind>:<slug do título>`. */
  documentKey: string;
  title: string;
  documentUrl: string;
  normativeAct: string | null;
  normativeActUrl: string | null;
  publishedAt: Date | null;
  annexUpdatedAt: Date | null;
  /** "PCDT Resumido" / "DDT Resumido" etc. */
  summaryUrl: string | null;
}

export interface DocumentSection {
  /** Número da seção de primeiro nível, ou `null` no corpo sem estrutura. */
  number: number | null;
  title: string;
  text: string;
  included: boolean;
}

export interface SectionedDocument {
  sections: DocumentSection[];
  sectioning: 'structured' | 'fallback';
  cid10: string[];
  /** Início da introdução, usado só para classificar (nunca vira chunk). */
  introduction: string;
}

export const POPULATIONS = ['adulto', 'pediatrico', 'todos'] as const;
export type Population = (typeof POPULATIONS)[number];

export interface DocumentClassification {
  careSetting: CareSetting;
  population: Population | null;
  specialty: string;
  cenarios: string[];
  source: 'llm' | 'heuristic';
  model?: string;
  rationale: string;
}
