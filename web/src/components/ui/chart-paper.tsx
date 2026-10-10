import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * "Folha" do prontuário: moldura de 1px para o documento assinado, como uma
 * página impressa dentro da página do Notion. O rodapé carrega o hash
 * SHA-256 completo (mono) e a origem da trilha de auditoria.
 */
function ChartPaper({
  children,
  title,
  metadata,
  headerSlot,
  hash,
  footerNote = "Copiloto Clínico · trilha de auditoria CFM",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title?: React.ReactNode
  metadata?: React.ReactNode
  headerSlot?: React.ReactNode
  /** Hash SHA-256 do conteúdo assinado, exibido por inteiro no rodapé. */
  hash?: string | null
  footerNote?: React.ReactNode
}) {
  const hasHeader = title || metadata || headerSlot

  return (
    <div
      data-slot="chart-paper"
      className={cn(
        "mx-auto w-full max-w-[720px] rounded-lg border border-border bg-card px-5 py-6 text-card-foreground sm:px-10 sm:py-8",
        className
      )}
      {...props}
    >
      {hasHeader ? (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-xl font-bold tracking-[-0.01em] text-foreground">{title}</h2>
            ) : null}
            {metadata ? (
              <p className="mt-1 text-[0.8125rem] text-muted-foreground">{metadata}</p>
            ) : null}
          </div>
          {headerSlot ? <div className="shrink-0">{headerSlot}</div> : null}
        </div>
      ) : null}

      <div>{children}</div>

      {hash ? (
        <div className="mt-8 flex flex-col gap-1 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <p className="min-w-0">
            <span className="mr-1.5 font-medium">SHA-256</span>
            <span className="font-mono break-all">{hash}</span>
          </p>
          {footerNote ? <p className="shrink-0">{footerNote}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export { ChartPaper }
