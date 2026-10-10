/**
 * S22-ERR-01 — Página 404 (Next.js app router).
 *
 * Server Component (não pode ter "use client"). Ícones vêm da variante SSR do
 * Phosphor (`@phosphor-icons/react/ssr`), que não depende de createContext; a
 * barra com a marca é um Client Component à parte.
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, FileDashed, Plus } from '@phosphor-icons/react/ssr';
import { buttonVariants } from '@/components/ui/button';
import { PublicHeader } from './_components/public-chrome';

export const metadata: Metadata = {
  title: 'Página não encontrada — Copiloto Clínico',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader showAuthActions={false} />
      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-8 pb-[18vh] text-center">
        <FileDashed weight="duotone" className="size-14 text-muted-foreground" aria-hidden="true" />
        <p className="mt-5 text-sm text-muted-foreground">Erro 404</p>
        <h1 className="mt-1 font-display text-2xl text-balance text-foreground sm:text-3xl">
          Página não encontrada
        </h1>
        <p className="mt-2 max-w-sm text-[0.9375rem] text-pretty text-muted-foreground">
          A página que você procura pode ter sido movida, excluída, ou talvez nunca tenha existido.
        </p>
        <div className="mt-7 flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
          <Link href="/dashboard" className={buttonVariants({ size: 'lg' })}>
            <ArrowLeft aria-hidden="true" />
            Ir para o Plantão
          </Link>
          <Link href="/encounters/new" className={buttonVariants({ size: 'lg', variant: 'ghost' })}>
            <Plus aria-hidden="true" />
            Novo caso
          </Link>
        </div>
      </main>
    </div>
  );
}
