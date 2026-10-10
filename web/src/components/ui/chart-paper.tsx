import * as React from "react"

import { cn } from "@/lib/utils"

function ChartPaper({
  children,
  title,
  metadata,
  headerSlot,
  hashFooter,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string
  metadata?: string
  headerSlot?: React.ReactNode
  hashFooter?: string
}) {
  const hasHeader = title || metadata || headerSlot

  return (
    <div
      data-slot="chart-paper"
      className={cn(
        "mx-auto max-w-[720px] rounded-lg border border-border bg-card px-6 py-8 shadow-sm sm:px-12 sm:py-10",
        className
      )}
      {...props}
    >
      {hasHeader ? (
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-display text-3xl">
                {title}
              </h2>
            ) : null}
            {metadata ? (
              <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
                {metadata}
              </p>
            ) : null}
          </div>
          {headerSlot ? <div className="flex-shrink-0">{headerSlot}</div> : null}
        </div>
      ) : null}

      <div className="mt-4">{children}</div>

      {hashFooter ? (
        <div
          className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
        >
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {hashFooter}
          </span>
          <span className="text-[0.6875rem] text-muted-foreground">
            Copiloto Clínico · trilha de auditoria CFM
          </span>
        </div>
      ) : null}
    </div>
  )
}

export { ChartPaper }
