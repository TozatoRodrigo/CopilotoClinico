import { getRegionalBlock, isRegionalBlockId } from './content';

/**
 * As seções do roteiro de bloqueios, na ordem da tela inicial do BlockPath do
 * ANY. Cada uma é uma página em /ferramentas/bloqueios/<id>; a ficha de cada
 * bloqueio fica em /ferramentas/bloqueios/<id do bloqueio>.
 */
export const BLOCK_SECTIONS = [
  {
    id: 'topografia',
    title: 'Escolher pela lesão',
    subtitle: 'Onde está a lesão e qual bloqueio considerar',
  },
  { id: 'lista', title: 'Lista de bloqueios', subtitle: 'Os 14 bloqueios, por região' },
  { id: 'dose-maxima', title: 'Dose máxima', subtitle: 'Anestésico local por peso, em mg e mL' },
  {
    id: 'last',
    title: 'LAST — toxicidade',
    subtitle: 'Intoxicação por anestésico local e emulsão lipídica',
  },
  { id: 'evolucao', title: 'Nota de evolução', subtitle: 'Texto do bloqueio para o prontuário' },
] as const;

export type BlockSectionId = (typeof BLOCK_SECTIONS)[number]['id'];

export const BLOCKS_HREF = '/ferramentas/bloqueios';

export function blockSectionHref(id: BlockSectionId): string {
  return `${BLOCKS_HREF}/${id}`;
}

export function regionalBlockHref(id: string): string {
  return `${BLOCKS_HREF}/${id}`;
}

/** Título de uma página do roteiro pelo segmento da rota (trilha e ⌘K). */
export function blockPageTitle(segment: string): string | undefined {
  const section = BLOCK_SECTIONS.find(({ id }) => id === segment);
  if (section) return section.title;
  return isRegionalBlockId(segment) ? getRegionalBlock(segment).name : undefined;
}
