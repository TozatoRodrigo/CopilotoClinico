"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sentry, initSentry } from "@/lib/sentry";
import { messages } from "@/lib/messages";

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
      <h2 className="text-xl font-semibold">{messages.errors.encounterLoadTitle}</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        {messages.errors.encounterLoadDescription}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>{messages.common.actions.tryAgain}</Button>
        <Button variant="outline" onClick={() => router.push("/encounters")}>
          {messages.common.actions.backToEncounters}
        </Button>
      </div>
    </div>
  );
}
