"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sentry, initSentry } from "@/lib/sentry";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[AppError]", error);
    initSentry();
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">Algo deu errado</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        Ocorreu um erro inesperado. Você pode tentar novamente ou voltar ao início.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Ir para o início
        </Button>
      </div>
    </div>
  );
}
