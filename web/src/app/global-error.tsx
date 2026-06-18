'use client';

/**
 * S22-ERR-01 — Error boundary GLOBAL (Next.js app router).
 *
 * Captura erros que escapam dos boundaries de grupo (ex: erros no layout raiz,
 * no RootLayout itself, ou durante o streaming do SSR). É o último recurso antes
 * da tela branca — deve ser mínimo (sem dependências que possam falhar tambem).
 *
 * Referencia: https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
import { useEffect } from 'react';
import { Sentry, initSentry } from '@/lib/sentry';
import { messages } from '@/lib/messages';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[GlobalError]', error);
    try {
      initSentry();
      Sentry.captureException(error);
    } catch {
      // Sentry pode falhar em modo offline ou config ausente — não derrubar
      // o boundary de erro tentando reportar o erro.
    }
  }, [error]);

  return (
    // html/body são exigidos pelo Next.js no global-error (ele substitui o RootLayout).
    <html lang="pt-BR">
      <body className="min-h-screen bg-background antialiased">
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            {messages.errors.genericTitle}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {messages.errors.genericDescription}
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Código: {error.digest}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {messages.common.actions.tryAgain}
            </button>
            <a
              href="/dashboard"
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {messages.common.actions.backToHome}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
