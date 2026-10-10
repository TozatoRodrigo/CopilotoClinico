import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Métricas no estilo de um bloco do Notion: contorno fino, rótulo em cinza
 * (sem caixa-alta) e número grande em sans com algarismos tabulares.
 * `highlight` usa o fundo azul de bloco para a métrica que pede ação.
 */
const statCardVariants = cva(
  "flex min-h-[96px] flex-col justify-between gap-2 rounded-lg px-4 py-3.5",
  {
    variants: {
      variant: {
        highlight: "bg-tone-blue-bg text-tone-blue-ink",
        default: "border border-border bg-card text-foreground",
        success: "bg-tone-green-bg text-tone-green-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function StatCard({
  label,
  value,
  sublabel,
  variant = "default",
  icon,
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof statCardVariants> & {
    label: string
    value: string | number
    sublabel?: string
    icon?: React.ReactNode
  }) {
  return (
    <div
      data-slot="stat-card"
      data-variant={variant}
      className={cn(statCardVariants({ variant }), className)}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {icon ? <span className="size-4 shrink-0 opacity-80">{icon}</span> : null}
        <span
          className={cn(
            "text-sm",
            variant === "default" ? "text-muted-foreground" : "opacity-85"
          )}
        >
          {label}
        </span>
      </div>
      <div className="text-[2.25rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </div>
      {sublabel ? (
        <span
          className={cn(
            "text-xs",
            variant === "default" ? "text-muted-foreground" : "opacity-80"
          )}
        >
          {sublabel}
        </span>
      ) : null}
    </div>
  )
}

interface StatStripItem {
  label: string
  value: React.ReactNode
}

function StatStrip({
  items,
  className,
}: {
  items: StatStripItem[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex divide-x divide-border rounded-lg border border-border bg-card",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-1 flex-col justify-center gap-1.5 px-4 py-3.5"
        >
          <span className="text-sm text-muted-foreground">{item.label}</span>
          <span className="text-xl leading-none font-semibold tracking-[-0.01em] text-foreground tabular-nums">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export { StatCard, StatStrip, statCardVariants }
