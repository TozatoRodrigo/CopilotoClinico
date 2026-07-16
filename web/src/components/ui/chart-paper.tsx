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
        "mx-auto max-w-[680px] rounded-[4px] border border-clinical-line bg-card py-11 px-[3.25rem] shadow-[0_2px_6px_rgba(16,36,58,0.08),0_12px_32px_rgba(16,36,58,0.07)]",
        className
      )}
      {...props}
    >
      {hasHeader ? (
        <div
          className="flex items-start justify-between border-b-2 pb-[18px]"
          style={{ borderColor: "var(--ink)" }}
        >
          <div className="min-w-0">
            {title ? (
              <h2 className="font-display text-[1.875rem] font-normal leading-[1.15]">
                {title}
              </h2>
            ) : null}
            {metadata ? (
              <p className="mt-1.5 font-mono text-xs text-clinical-ink-soft">
                {metadata}
              </p>
            ) : null}
          </div>
          {headerSlot ? <div className="flex-shrink-0">{headerSlot}</div> : null}
        </div>
      ) : null}

      <div className="mt-2">{children}</div>

      {hashFooter ? (
        <div
          className="mt-7 flex items-center justify-between border-t border-dashed border-clinical-line pt-3.5"
        >
          <span className="font-mono text-[0.625rem] text-clinical-ink-soft opacity-60">
            {hashFooter}
          </span>
          <span className="font-mono text-[0.625rem] text-clinical-ink-soft opacity-60">
            Copiloto Clínico · trilha de auditoria CFM
          </span>
        </div>
      ) : null}
    </div>
  )
}

export { ChartPaper }
