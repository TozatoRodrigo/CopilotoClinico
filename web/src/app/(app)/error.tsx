"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Sentry, initSentry } from "@/lib/sentry";
import { messages } from "@/lib/messages";

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
    <Page width="narrow" className="items-center gap-5 py-10 text-center md:py-16">
      <WarningCircle weight="duotone" className="size-12 text-tone-red" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground">
          {messages.errors.genericTitle}
        </h1>
        <p className="max-w-md text-[0.9375rem] text-pretty text-muted-foreground">
          {messages.errors.genericDescription}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>{messages.common.actions.tryAgain}</Button>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          {messages.common.actions.backToHome}
        </Button>
      </div>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Código do erro: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </Page>
  );
}
