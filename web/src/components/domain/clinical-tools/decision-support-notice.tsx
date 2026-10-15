'use client';

import { Info } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export const DECISION_SUPPORT_TEXT = 'Apoio à decisão; não substitui o julgamento clínico.';

/**
 * Aviso fixo das Ferramentas (CC-304): aparece no hub e em toda ferramenta,
 * sem botão de fechar. Neutro de propósito — não é alerta que muda conduta.
 */
export function DecisionSupportNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-2 text-[0.8125rem] text-muted-foreground',
        className,
      )}
    >
      <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
      <span>{DECISION_SUPPORT_TEXT}</span>
    </p>
  );
}
