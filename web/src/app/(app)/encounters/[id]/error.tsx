"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sentry, initSentry } from "@/lib/sentry";

export default function EncounterDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[EncounterDetailError]", error);
    initSentry();
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">Erro ao carregar atendimento</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        Não foi possível carregar os dados deste atendimento.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => router.push("/encounters")}>
          Voltar para atendimentos
        </Button>
      </div>
    </div>
  );
}
