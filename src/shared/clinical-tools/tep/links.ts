/**
 * Ligações do roteiro do TEP para outras ferramentas (CC-318). O ANY ligava
 * para `/infusion?drug=…`, `/airway` e `/seda`; aqui o endereço é o das
 * Ferramentas do Copiloto. Enquanto a ferramenta de destino estiver "em
 * breve", o link abre a página de "em breve" dela (/ferramentas/[id]).
 */

/** Drogas de Infusões que o roteiro abre direto (CC-311 e CC-312). */
export const TEP_INFUSION_DRUGS = ['heparina', 'noradrenalina', 'dobutamina'] as const;
export type TepInfusionDrug = (typeof TEP_INFUSION_DRUGS)[number];

/** Seções da referência rápida do TEP (aba Referência). */
export const TEP_REFERENCE_SECTIONS = [
  'laboratorio',
  'contraindicacoes',
  'eco',
  'anticoagulacao',
  'trombolise',
  'suporte',
  'filtro-vci',
] as const;
export type TepReferenceSectionId = (typeof TEP_REFERENCE_SECTIONS)[number];

/** Roteiros do ANY que o TEP cita na intubação: Via aérea e Sedação. */
export type TepLinkedTool = 'via-aerea' | 'sedacao';

export type TepLink =
  | { kind: 'infusao'; drug: TepInfusionDrug; label: string }
  | { kind: 'ferramenta'; toolId: TepLinkedTool; label: string }
  | { kind: 'referencia'; section: TepReferenceSectionId; label: string };

/**
 * Endereço de uma droga em Infusões: `/ferramentas/infusoes?droga=<id>`, o
 * formato que a tela de Infusões lê (CC-311). O ANY usava `?drug=`.
 */
export function infusionDrugHref(drug: TepInfusionDrug): string {
  return `/ferramentas/infusoes?droga=${drug}`;
}

export function linkedToolHref(toolId: TepLinkedTool): string {
  return `/ferramentas/${toolId}`;
}
