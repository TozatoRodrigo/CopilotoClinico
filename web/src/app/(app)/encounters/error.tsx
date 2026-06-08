"use client";

import { useEffect } from "react";
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
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">Erro ao carregar atendimentos</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        Não foi possível carregar a lista de atendimentos.
      </p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
