'use client';

import { usePathname } from 'next/navigation';
import { originFromPath, type ToolOrigin } from '@clinical-tools/links';

/**
 * De onde sai o link para outra ferramenta (CC-331): a rota atual. O destino
 * recebe `?de=` e mostra "Voltar para …"; o estado da origem está na sessão
 * da aba.
 */
export function useToolOrigin(): ToolOrigin | null {
  return originFromPath(usePathname() ?? '');
}
