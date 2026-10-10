"use client";

import { useEffect } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Sentry, initSentry } from "@/lib/sentry";

export default function EncountersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[EncountersError]", error);
    initSentry();
    Sentry.captureException(error);
  }, [error]);

  return (
    <Page width="narrow" className="items-center gap-5 py-10 text-center md:py-16">
      <WarningCircle weight="duotone" className="size-12 text-tone-red" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground">
          Erro ao carregar atendimentos
        </h1>
        <p className="max-w-md text-[0.9375rem] text-pretty text-muted-foreground">
          Não foi possível carregar a lista de atendimentos.
        </p>
      </div>
      <Button onClick={reset}>Tentar novamente</Button>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Código do erro: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </Page>
  );
}
