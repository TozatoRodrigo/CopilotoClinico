import { TOOLS } from '@clinical-tools/catalog';

/**
 * Atalho para Infusões contínuas (noradrenalina na otimização, sedação depois
 * da intubação), como no ANY. Enquanto Infusões estiver "em breve" no
 * catálogo, não há link: a tela não aponta para uma página que não abre.
 */
export function infusionsHref(drug?: string): string | null {
  const infusions = TOOLS.find(({ id }) => id === 'infusoes');
  if (infusions?.status !== 'disponivel') return null;
  return drug ? `/ferramentas/infusoes?droga=${encodeURIComponent(drug)}` : '/ferramentas/infusoes';
}
