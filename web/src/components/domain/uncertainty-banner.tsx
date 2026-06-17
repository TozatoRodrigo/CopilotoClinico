"use client";

import { Warning } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { messages } from "@/lib/messages";

interface UncertaintyBannerProps {
  reason?: string | null;
  title?: string;
  className?: string;
}

export function UncertaintyBanner({
  reason,
  title = messages.uncertainty.title,
  className,
}: UncertaintyBannerProps) {
  return (
    <Alert className={cn("border-clinical-amber/40 bg-card", className)}>
      <Warning className="text-clinical-amber" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{reason ?? messages.uncertainty.defaultReason}</AlertDescription>
    </Alert>
  );
}
