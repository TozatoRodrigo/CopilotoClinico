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
import { Button } from '@/components/ui/button';
import { Sentry, initSentry } from '@/lib/sentry';
import { messages } from '@/lib/messages';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line no-console
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
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h2 className="text-xl font-semibold tracking-tight">
        Erro no console administrativo
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Algo deu errado ao carregar esta página do console. Sua sessão foi
        preservada — tente novamente ou volte ao workspace clínico.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Código: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{messages.common.actions.tryAgain}</Button>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          Voltar ao workspace
        </Button>
      </div>
    </div>
  );
}
