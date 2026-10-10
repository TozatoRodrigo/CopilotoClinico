"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const BAR_DELAYS = ["0s", "0.3s", "0.15s", "0.45s", "0.05s", "0.35s", "0.2s"]

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return reduced
}

/**
 * Onda de gravação: barras finas que pulsam enquanto o microfone está
 * aberto. A cor vem de `currentColor` — passe um token de texto em
 * `className` (padrão `text-primary`, o azul de IA/ação) em vez de cor
 * inline. Respeita `prefers-reduced-motion` (barras paradas).
 */
function RecordingWaveform({
  active,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  active: boolean
}) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const animate = active && !prefersReducedMotion

  return (
    <div
      data-slot="recording-waveform"
      role={active ? "status" : undefined}
      aria-label={active ? "Gravando áudio" : undefined}
      className={cn("flex h-6 items-center gap-[3px] text-primary", className)}
      {...props}
    >
      {BAR_DELAYS.map((delay) => (
        <span
          key={delay}
          className={cn(
            "h-full w-[3px] origin-center rounded-full bg-current",
            !active && "scale-y-[0.3] opacity-40"
          )}
          style={
            animate
              ? { animation: "wave 1s ease-in-out infinite", animationDelay: delay }
              : undefined
          }
        />
      ))}
    </div>
  )
}

export { RecordingWaveform }
