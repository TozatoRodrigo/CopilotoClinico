"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const BAR_DELAYS = ["0s", "0.15s", "0.3s", "0.45s", "0.6s"]

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

function RecordingWaveform({
  active,
  color = "var(--teal)",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  active: boolean
  color?: string
}) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const animate = active && !prefersReducedMotion

  return (
    <div
      data-slot="recording-waveform"
      role={active ? "status" : undefined}
      aria-label={active ? "Gravando áudio" : undefined}
      className={cn("flex h-6 items-center gap-[3px]", className)}
      {...props}
    >
      {BAR_DELAYS.map((delay) => (
        <span
          key={delay}
          className="h-[22px] w-1 rounded-[2px]"
          style={{
            backgroundColor: color,
            transformOrigin: "center",
            ...(animate
              ? {
                  animation: "wave 1s ease-in-out infinite",
                  animationDelay: delay,
                }
              : active
                ? {}
                : { transform: "scaleY(0.35)", opacity: 0.4 }),
          }}
        />
      ))}
    </div>
  )
}

export { RecordingWaveform }
