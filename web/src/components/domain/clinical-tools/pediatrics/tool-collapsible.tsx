'use client';

import type { ReactNode } from 'react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface ToolCollapsibleProps {
  title: ReactNode;
  /** Texto à direita do título (contagem, faixa de dose). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Nível do título, para a ordem de cabeçalhos da página; `none` para bloco de detalhe. */
  headingLevel?: 'h2' | 'h3' | 'h4' | 'none';
  className?: string;
  children: ReactNode;
}

/**
 * Bloco que abre e fecha nas telas de beira-leito. Igual ao `Disclosure`, mas
 * com o alvo de toque de 44 px que a ferramenta pede no celular (ADR-017) e o
 * título dentro de um cabeçalho, para quem navega por títulos. A seta gira
 * pelo estado do próprio botão: blocos aninhados não giram juntos.
 */
export function ToolCollapsible({
  title,
  meta,
  defaultOpen = false,
  headingLevel = 'h3',
  className,
  children,
}: ToolCollapsibleProps) {
  const Heading = headingLevel === 'none' ? 'div' : headingLevel;
  return (
    <CollapsiblePrimitive.Root
      data-slot="tool-collapsible"
      defaultOpen={defaultOpen}
      className={className}
    >
      <Heading className="m-0">
        <CollapsiblePrimitive.Trigger
          className={cn(
            'group/trigger flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-foreground transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
            headingLevel === 'none' ? 'text-sm font-medium' : 'text-[0.9375rem] font-semibold',
          )}
        >
          <CaretRight
            weight="bold"
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/trigger:rotate-90"
          />
          <span className="min-w-0 flex-1">{title}</span>
          {meta ? (
            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
              {meta}
            </span>
          ) : null}
        </CollapsiblePrimitive.Trigger>
      </Heading>
      <CollapsiblePrimitive.Content className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="flex flex-col gap-3 px-1 pt-1 pb-3">{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
