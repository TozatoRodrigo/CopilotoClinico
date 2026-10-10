'use client';

/**
 * S22-ERR-01 — Error boundary do grupo (admin).
 *
 * Especifico para rotas administrativas (não compartilha do (app) porque
 * tem CTAs diferentes: "Voltar ao workspace" em vez de "Ir ao painel",
 * e tom mais operacional (admin/compliance).
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Sentry, initSentry } from '@/lib/sentry';
import { useMessages } from '@/lib/messages/use-messages';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const messages = useMessages();

  useEffect(() => {
    console.error('[AdminError]', error);
    try {
      initSentry();
      Sentry.captureException(error, { tags: { area: 'admin' } });
    } catch {
      // noop — Sentry pode falhar em config ausente
    }
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center md:py-24"
    >
      <WarningCircle className="size-10 text-tone-red" weight="duotone" aria-hidden="true" />
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
          Erro no console administrativo
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Algo deu errado ao carregar esta página do console. Sua sessão foi
          preservada — tente novamente ou volte ao workspace clínico.
        </p>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          Código: <span className="font-mono">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>{messages.common.actions.tryAgain}</Button>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          Voltar ao workspace
        </Button>
      </div>
    </div>
  );
}
