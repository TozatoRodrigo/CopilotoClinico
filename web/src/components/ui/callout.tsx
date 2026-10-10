import * as React from "react"

import { cn } from "@/lib/utils"
import { toneBg, toneInk, toneText, type Tone } from "@/lib/tone"

/**
 * Bloco "callout" do Notion: fundo de cor de bloco, ícone à esquerda,
 * texto com tinta do tom. Estático (sem role de alerta) — para mensagens que
 * precisam ser anunciadas por leitor de tela, use <Alert>.
 *
 * Semântica clínica: `orange` = muda a conduta, `green` = confirmado,
 * `red` = erro/risco, `blue` = informação/IA, `gray` = nota neutra.
 */
function Callout({
  tone = "gray",
  icon,
  title,
  action,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  tone?: Tone
  /** Ícone (ex.: <Info />) ou emoji. */
  icon?: React.ReactNode
  title?: React.ReactNode
  /** Ação alinhada à direita (botão/link). */
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="callout"
      data-tone={tone}
      className={cn(
        "flex gap-3 rounded-md px-4 py-3 text-sm",
        toneBg[tone],
        tone === "gray" ? "text-foreground" : toneInk[tone],
        className
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "mt-px flex size-5 shrink-0 items-center justify-center text-base leading-none [&_svg:not([class*='size-'])]:size-[18px]",
            toneText[tone]
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className="text-pretty opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}

export { Callout }
