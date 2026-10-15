'use client';

import type { ReactNode } from 'react';
import { CHECKLISTS, type AirwayChecklistKey } from '@clinical-tools/airway/content';
import { Block, CheckList, CheckRow } from './airway-parts';
import type { StepProps } from './step-props';

type ChecklistItem = (typeof CHECKLISTS)[AirwayChecklistKey]['items'][number];

function detailOf(item: ChecklistItem, view: StepProps['view']): string | undefined {
  if (!('detailFrom' in item)) return 'detail' in item ? item.detail : undefined;
  return item.detailFrom === 'tubo' ? `Tamanho: ${view.tube ?? '--'}` : view.supraglotticDevice;
}

/**
 * Um checklist do roteiro (plano A, pré-oxigenação, confirmação…). O que é
 * marcado fica no estado do roteiro: sobrevive a trocar de passo e entra no
 * resumo quando é confirmação.
 */
export function ChecklistSection({
  checklist,
  state,
  view,
  dispatch,
  children,
}: Pick<StepProps, 'state' | 'view' | 'dispatch'> & {
  checklist: AirwayChecklistKey;
  /** Conteúdo abaixo da lista (campo de altura, técnica…). */
  children?: ReactNode;
}) {
  const { title, items } = CHECKLISTS[checklist];
  return (
    <Block title={title}>
      <CheckList>
        {items.map((item: ChecklistItem) => (
          <CheckRow
            key={item.id}
            title={item.title}
            detail={detailOf(item, view)}
            checked={state.checked.includes(item.id)}
            onToggle={() => dispatch({ type: 'toggle-check', id: item.id })}
          />
        ))}
      </CheckList>
      {children}
    </Block>
  );
}
