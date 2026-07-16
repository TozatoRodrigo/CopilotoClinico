import * as React from "react"

import { cn } from "@/lib/utils"

function ProgressSteps({
  steps,
  currentStep,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  steps: string[]
  currentStep: number
}) {
  return (
    <div
      data-slot="progress-steps"
      className={cn("flex flex-wrap items-center gap-2.5", className)}
      {...props}
    >
      {steps.map((step, index) => {
        const isActive = index <= currentStep
        return (
          <span key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "h-[5px] w-5 rounded-[3px]",
                isActive ? "bg-clinical-teal" : "bg-clinical-line"
              )}
            />
            <span
              className={cn(
                "text-sm",
                index === currentStep
                  ? "font-semibold text-clinical-ink"
                  : "font-medium text-clinical-ink-soft"
              )}
            >
              {step}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export { ProgressSteps }
