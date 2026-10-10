import * as React from "react"

import { cn } from "@/lib/utils"

/** Atalho de teclado no estilo Notion (⌘K, ↵, Esc). */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-background px-1 font-sans text-[0.6875rem] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
