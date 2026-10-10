"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Abas no estilo das "views" de database do Notion: texto 14px, aba ativa
 * sublinhada em 2px na cor do texto. `segmented` é o seletor compacto do
 * Notion (fundo cinza, item ativo em "cartão") para alternâncias curtas.
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-3 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "max-w-full gap-1 overflow-x-auto border-b border-border group-data-horizontal/tabs:h-9",
        line: "max-w-full gap-1 overflow-x-auto border-b border-border group-data-horizontal/tabs:h-9",
        segmented:
          "gap-0.5 rounded-md bg-tone-gray-bg p-0.5 group-data-horizontal/tabs:h-8",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Sublinhado (default/line)
        "group-data-[variant=default]/tabs-list:h-full group-data-[variant=default]/tabs-list:rounded-sm group-data-[variant=default]/tabs-list:px-2 group-data-[variant=default]/tabs-list:hover:bg-hover group-data-[variant=default]/tabs-list:data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:rounded-sm group-data-[variant=line]/tabs-list:px-2 group-data-[variant=line]/tabs-list:hover:bg-hover group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 group-data-[variant=default]/tabs-list:data-active:after:opacity-100 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        // Segmentado
        "group-data-[variant=segmented]/tabs-list:h-full group-data-[variant=segmented]/tabs-list:flex-1 group-data-[variant=segmented]/tabs-list:rounded-[4px] group-data-[variant=segmented]/tabs-list:px-2.5 group-data-[variant=segmented]/tabs-list:data-active:bg-background group-data-[variant=segmented]/tabs-list:data-active:text-foreground group-data-[variant=segmented]/tabs-list:data-active:shadow-sm dark:group-data-[variant=segmented]/tabs-list:data-active:bg-active",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
