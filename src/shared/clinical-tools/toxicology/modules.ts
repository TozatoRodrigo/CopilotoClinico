/**
 * Seções do roteiro de Toxicologia, na ordem da tela inicial do ToxPath do
 * ANY. O id é também o trecho do endereço (/ferramentas/toxicologia/<id>).
 */
export const TOX_MODULES = [
  {
    id: 'toxindromes',
    title: 'Identificar toxíndrome',
    subtitle: 'Fluxo interativo baseado em sinais clínicos',
  },
  {
    id: 'descontaminacao',
    title: 'Descontaminação GI',
    subtitle: 'Carvão ativado e lavagem gástrica',
  },
  {
    // "Critérios de disposição" no ANY.
    id: 'destino',
    title: 'Critérios de destino',
    subtitle: 'Alta, enfermaria ou UTI',
  },
  { id: 'antidotos', title: 'Guia de antídotos', subtitle: 'Doses e indicações' },
  {
    id: 'checklist',
    title: 'Checklist de avaliação',
    subtitle: 'Exame físico direcionado para intoxicações',
  },
  {
    id: 'tabelas',
    title: 'Tabelas de consulta',
    subtitle: 'Toxíndromes, odores, ECG, achados',
  },
] as const;

export type ToxModuleId = (typeof TOX_MODULES)[number]['id'];
export type ToxModule = (typeof TOX_MODULES)[number];

export function toxModuleHref(id: ToxModuleId): string {
  return `/ferramentas/toxicologia/${id}`;
}

export function findToxModule(id: string | undefined): ToxModule | undefined {
  return TOX_MODULES.find((module) => module.id === id);
}
