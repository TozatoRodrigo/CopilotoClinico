"use client";

import Link from "next/link";
import { Warning } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { messages } from "@/lib/messages";

interface UncertaintyBannerProps {
  reason?: string | null;
  title?: string;
  className?: string;
  /**
   * UX-02 — ação primária: abre o campo de complemento livre do caso.
   * Omitida quando não há mais rodadas de reanálise disponíveis (ver
   * canComplement no hook use-copilot-conversation) — nesse caso o banner
   * segue honesto sobre a incerteza, mas sem oferecer uma ação quebrada.
   */
  onComplementCase?: () => void;
  /**
   * UX-02 — ação secundária: leva à busca manual nas diretrizes, já
   * preenchida a partir do motivo da incerteza.
   */
  guidelinesHref?: string;
}

export function UncertaintyBanner({
  reason,
  title = messages.uncertainty.title,
  className,
  onComplementCase,
  guidelinesHref,
}: UncertaintyBannerProps) {
  const hasAction = Boolean(onComplementCase || guidelinesHref);

  return (
    <Alert className={cn("border-clinical-amber/40 bg-card", className)}>
      <Warning className="text-clinical-amber" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{reason ?? messages.uncertainty.defaultReason}</p>
        {/* UX-02 — nenhum estado do copiloto pode terminar sem um próximo
            passo disponível; um banner de incerteza sem ação é exatamente
            o beco sem saída que a Sprint 26 eliminou no backend. */}
        {hasAction && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onComplementCase && (
              <Button type="button" size="sm" onClick={onComplementCase}>
                {messages.uncertainty.actions.complementCase}
              </Button>
            )}
            {guidelinesHref && (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={guidelinesHref}>{messages.uncertainty.actions.searchGuidelines}</Link>
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
