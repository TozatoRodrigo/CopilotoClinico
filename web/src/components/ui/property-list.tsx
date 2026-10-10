import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Propriedades de página do Notion: coluna de rótulos em cinza (com ícone) à
 * esquerda e valores à direita, logo abaixo do título. Ideal para metadados
 * do caso (paciente, vertical, status, criado em).
 */
function PropertyList({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="property-list"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PropertyRow({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon?: React.ElementType
  label: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      data-slot="property-row"
      className={cn(
        "grid min-h-[34px] grid-cols-[minmax(7.5rem,10rem)_1fr] items-center gap-2 sm:grid-cols-[10rem_1fr]",
        className
      )}
    >
      <dt className="flex min-w-0 items-center gap-1.5 self-start py-1.5 text-muted-foreground">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0 rounded-sm px-1.5 py-1.5 text-foreground">{children}</dd>
    </div>
  )
}

export { PropertyList, PropertyRow }
