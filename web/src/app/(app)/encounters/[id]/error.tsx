"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function EncounterDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[EncounterDetailError]", error);
    if (typeof window !== "undefined" && "Sentry" in window) {
      (window as unknown as { Sentry: { captureException: (e: unknown) => void } }).Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">Erro ao carregar atendimento</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        Não foi possível carregar os dados deste atendimento.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/encounters")}>
          Voltar para atendimentos
        </Button>
      </div>
    </div>
  );
}
