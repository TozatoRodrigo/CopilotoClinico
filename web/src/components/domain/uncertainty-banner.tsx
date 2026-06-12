"use client";

import { Warning } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface UncertaintyBannerProps {
  reason?: string | null;
  title?: string;
  className?: string;
}

const DEFAULT_REASON = "Evidência insuficiente para este cenário. Recomenda-se revisão adicional.";

export function UncertaintyBanner({
  reason,
  title = "Incerteza na análise",
  className,
}: UncertaintyBannerProps) {
  return (
    <Alert className={cn("border-clinical-amber/40 bg-card", className)}>
      <Warning className="text-clinical-amber" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{reason ?? DEFAULT_REASON}</AlertDescription>
    </Alert>
  );
}
