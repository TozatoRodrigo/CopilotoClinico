'use client';

import { useCallback } from 'react';
import {
  INITIAL_TEP_STATE,
  parseTepPathwayState,
  tepReducer,
  type TepAction,
  type TepPathwayState,
} from '@clinical-tools/tep/pathway';
import { useToolSession } from '@/lib/tool-session';

/**
 * Estado da tela do TEP na sessão da aba (tool-session.ts): o roteiro (o
 * reducer do motor) e a aba aberta. Quem toca na heparina, vai para Infusões e
 * volta encontra o roteiro no mesmo passo, com as mesmas respostas. Só ids e
 * respostas — nada que identifique paciente.
 */

export const TEP_TABS = ['roteiro', 'calculadoras', 'referencia'] as const;
export type TepTab = (typeof TEP_TABS)[number];

export function isTepTab(value: unknown): value is TepTab {
  return typeof value === 'string' && (TEP_TABS as readonly string[]).includes(value);
}

function parseTab(value: unknown): TepTab | null {
  return isTepTab(value) ? value : null;
}

export type TepDispatch = (action: TepAction) => void;

export function useTepPathway(): [TepPathwayState, TepDispatch] {
  const [state, setState] = useToolSession(
    'tep:roteiro',
    parseTepPathwayState,
    () => INITIAL_TEP_STATE,
  );
  const dispatch = useCallback<TepDispatch>(
    (action) => setState((current) => tepReducer(current, action)),
    [setState],
  );
  return [state, dispatch];
}

export function useTepTab(): [TepTab, (tab: TepTab) => void] {
  return useToolSession<TepTab>('tep:aba', parseTab, () => 'roteiro');
}
