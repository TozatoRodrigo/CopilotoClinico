'use client';

/**
 * S22-ERR-01 — Error boundary GLOBAL (Next.js app router).
 *
 * Captura erros que escapam dos boundaries de grupo (ex: erros no layout raiz,
 * no RootLayout itself, ou durante o streaming do SSR). É o último recurso antes
 * da tela branca — deve ser mínimo (sem dependências que possam falhar tambem).
 *
 * Como substitui o RootLayout, não herda os estilos globais nem o script que
 * aplica o tema: importamos o globals.css aqui e reaplicamos a classe `dark`
 * no cliente (mesma regra do script inline do layout raiz).
 *
 * Referencia: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 */
import './globals.css';
import { useEffect } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { Logo } from '@/components/brand/logo';
import { Button, buttonVariants } from '@/components/ui/button';
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
    console.error('[GlobalError]', error);
    try {
      initSentry();
      Sentry.captureException(error);
    } catch {
      // Sentry pode falhar em modo offline ou config ausente — não derrubar
      // o boundary de erro tentando reportar o erro.
    }
  }, [error]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle(
        'dark',
        stored === 'dark' || (!stored && prefersDark),
      );
    } catch {
      // storage indisponível — fica no tema claro
    }
  }, []);

  return (
    // html/body são exigidos pelo Next.js no global-error (ele substitui o RootLayout).
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <title>{`${messages.errors.genericTitle} — Copiloto Clínico`}</title>
        <header className="flex h-14 shrink-0 items-center px-4 sm:px-6">
          <Logo />
        </header>
        <main className="flex flex-1 flex-col items-center justify-center px-4 pt-8 pb-[18vh] text-center">
          <div role="alert" className="flex flex-col items-center">
            <WarningCircle weight="duotone" className="size-14 text-tone-red" aria-hidden="true" />
            <h1 className="mt-5 font-display text-2xl text-balance text-foreground sm:text-3xl">
              {messages.errors.genericTitle}
            </h1>
            <p className="mt-2 max-w-sm text-[0.9375rem] text-pretty text-muted-foreground">
              {messages.errors.genericDescription}
            </p>
            {error.digest && (
              <p className="mt-3 text-xs text-muted-foreground">
                Código: <span className="font-mono">{error.digest}</span>
              </p>
            )}
          </div>
          <div className="mt-7 flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
            <Button type="button" size="lg" onClick={reset}>
              {messages.common.actions.tryAgain}
            </Button>
            {/* <a> (não <Link>): navegação completa, já que o app está num estado quebrado. */}
            <a href="/dashboard" className={buttonVariants({ size: 'lg', variant: 'ghost' })}>
              {messages.common.actions.backToHome}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
