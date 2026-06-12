"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircle, Info, Warning, XCircle, CircleNotch } from "@phosphor-icons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle className="size-[18px]" />
        ),
        info: (
          <Info className="size-[18px]" />
        ),
        warning: (
          <Warning className="size-[18px]" />
        ),
        error: (
          <XCircle className="size-[18px]" />
        ),
        loading: (
          <CircleNotch className="size-[18px] animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
