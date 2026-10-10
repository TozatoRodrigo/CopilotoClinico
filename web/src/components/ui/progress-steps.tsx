import * as React from "react"
import { Check } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/**
 * Etapas do fluxo do caso (Captura → Análise → Documento) como uma trilha
 * discreta de texto, no tom do Notion: etapa atual em destaque, concluídas
 * com check, futuras em cinza claro.
 */
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
      className={cn("flex flex-wrap items-center gap-1 text-sm", className)}
      {...props}
    >
      {steps.map((step, index) => {
        const isDone = index < currentStep
        const isCurrent = index === currentStep
        return (
          <span key={step} className="flex items-center gap-1">
            {index > 0 && (
              <span aria-hidden="true" className="px-0.5 text-fg-tertiary">
                /
              </span>
            )}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5",
                isCurrent && "bg-hover font-medium text-foreground",
                isDone && "text-muted-foreground",
                !isDone && !isCurrent && "text-fg-tertiary"
              )}
            >
              {isDone ? (
                <Check className="size-3.5 text-clinical-green" weight="bold" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[0.625rem] font-semibold tabular-nums",
                    isCurrent
                      ? "bg-foreground text-background"
                      : "border border-current"
                  )}
                >
                  {index + 1}
                </span>
              )}
              {step}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export { ProgressSteps }
