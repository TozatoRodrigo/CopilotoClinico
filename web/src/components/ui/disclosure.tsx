"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { CaretRight } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/**
 * Bloco "toggle" do Notion: triângulo à esquerda que gira ao abrir, título
 * clicável, conteúdo recuado. Usado para detalhes secundários (raciocínio da
 * IA, metadados técnicos, histórico) sem poluir a leitura principal.
 */
function Disclosure({
  title,
  meta,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  contentClassName,
  children,
}: {
  title: React.ReactNode
  /** Texto secundário à direita do título (ex.: contagem). */
  meta?: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  contentClassName?: string
  children: React.ReactNode
}) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="disclosure"
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn("group/disclosure", className)}
    >
      <CollapsiblePrimitive.Trigger className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-sm px-1 py-1 text-left text-sm font-medium text-foreground transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
        <CaretRight
          weight="fill"
          aria-hidden="true"
          className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/disclosure:rotate-90"
        />
        <span className="min-w-0 flex-1">{title}</span>
        {meta ? (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">{meta}</span>
        ) : null}
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content
        className={cn(
          "overflow-hidden pl-[1.125rem] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          contentClassName
        )}
      >
        <div className="pt-1 pb-2">{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}

export { Disclosure }
