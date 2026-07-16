import * as React from "react"

import { cn } from "@/lib/utils"

const railColorVar = {
  amber: "var(--amber)",
  teal: "var(--teal)",
  gray: "var(--line)",
} as const

function TimelineRail({
  label,
  color = "teal",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: string
  color?: "amber" | "teal" | "gray"
}) {
  const colorVar = railColorVar[color]

  return (
    <div
      data-slot="timeline-rail"
      className={cn(
        "flex w-11 flex-col items-center gap-1 pt-1.5",
        className
      )}
      {...props}
    >
      <span
        className="font-mono text-[0.625rem] font-bold tracking-[0.1em] uppercase"
        style={{
          color: colorVar,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
        }}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className="flex-1 rounded-[2px]"
        style={{
          width: "3px",
          backgroundColor: colorVar,
        }}
      />
    </div>
  )
}

export { TimelineRail }
