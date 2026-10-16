'use client';

import { ArrowClockwise } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Falha ao carregar um painel do console, com "Tentar novamente". */
export function LoadError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <ArrowClockwise aria-hidden="true" />
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}
