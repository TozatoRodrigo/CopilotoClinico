import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Badge = tag de seleção do Notion: pílula de 3px de raio, texto 12px sem
 * caixa-alta, fundo pastel com tinta escura (AA ≥ 10:1).
 *
 * Variantes semânticas (`success`, `warning`, `destructive`) carregam o
 * significado clínico fixo da paleta — ver docs/design-system.md. As variantes
 * de cor (`gray`, `brown`, `purple`, `pink`, `blue`, `yellow`) são para
 * categorias sem significado clínico (vertical, tipo de documento, fonte).
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[3px] border border-transparent px-1.5 text-xs leading-none font-normal whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-tone-blue-tag text-tone-blue-ink [a]:hover:opacity-80",
        secondary: "bg-tone-gray-tag text-tone-gray-ink [a]:hover:opacity-80",
        destructive: "bg-tone-red-tag text-tone-red-ink [a]:hover:opacity-80",
        outline:
          "border-border text-muted-foreground [a]:hover:bg-hover [a]:hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-hover hover:text-foreground",
        link: "text-link underline-offset-4 hover:underline",
        success: "bg-tone-green-tag text-tone-green-ink",
        warning: "bg-tone-orange-tag text-tone-orange-ink",
        gray: "bg-tone-gray-tag text-tone-gray-ink",
        brown: "bg-tone-brown-tag text-tone-brown-ink",
        yellow: "bg-tone-yellow-tag text-tone-yellow-ink",
        blue: "bg-tone-blue-tag text-tone-blue-ink",
        purple: "bg-tone-purple-tag text-tone-purple-ink",
        pink: "bg-tone-pink-tag text-tone-pink-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
