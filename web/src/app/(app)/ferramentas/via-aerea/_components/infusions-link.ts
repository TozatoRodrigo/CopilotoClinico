import { TOOLS } from '@clinical-tools/catalog';
import { infusionHref } from '@clinical-tools/infusions/items';

/**
 * Atalho para Infusões contínuas, como no ANY: a noradrenalina na otimização
 * e, depois da intubação, a lista aberta na sedação e analgesia. Com `?de=`,
 * as Infusões oferecem a volta ao mesmo passo da via aérea (CC-331). Se
 * Infusões estiver "em breve" no catálogo, não há link: a tela não aponta
 * para uma página que não abre.
 */
export function infusionsHref(drug?: 'noradrenalina'): string | null {
  const infusions = TOOLS.find(({ id }) => id === 'infusoes');
  if (infusions?.status !== 'disponivel') return null;
  return infusionHref(drug, {
    group: drug ? undefined : 'sedation',
    from: { tool: 'via-aerea' },
  });
}
