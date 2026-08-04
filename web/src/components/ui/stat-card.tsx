import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statCardVariants = cva(
  "flex min-h-[104px] flex-col justify-between rounded-[14px] px-5 py-[18px]",
  {
    variants: {
      variant: {
        highlight: "bg-clinical-teal text-white",
        default:
          "border border-clinical-line bg-card text-clinical-ink",
        success:
          "border border-clinical-line bg-card text-clinical-ink",
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
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            className={cn(
              "size-4 shrink-0",
              variant === "success" && "text-clinical-green-foreground"
            )}
          >
            {icon}
          </span>
        ) : null}
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-[0.06em]",
            variant === "highlight" && "opacity-75",
            variant === "default" && "text-clinical-ink-soft",
            variant === "success" && "text-clinical-green-foreground"
          )}
        >
          {label}
        </span>
      </div>
      <div className="font-mono text-[2.5rem] font-semibold leading-none">
        {value}
      </div>
      {sublabel ? (
        <span className="text-[13px] opacity-70">{sublabel}</span>
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
        "flex divide-x divide-clinical-line rounded-[14px] border border-clinical-line bg-card",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-1 flex-col justify-center gap-1 px-5 py-[18px]"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-clinical-ink-soft">
            {item.label}
          </span>
          <span className="font-mono text-xl font-semibold leading-none text-clinical-ink">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export { StatCard, StatStrip, statCardVariants }
