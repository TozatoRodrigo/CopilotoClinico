/**
 * S22-ERR-01 — Página 404 (Next.js app router).
 *
 * Server Component (não pode ter "use client"). Usa SVG inline em vez de
 * ícones Phosphor (que dependem de createContext — só funciona em Client
 * Components).
 */
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Página não encontrada — Copiloto Clínico',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-center">
      <div className="space-y-3">
        <p className="font-display text-6xl tracking-tight text-muted-foreground/40 sm:text-7xl">
          404
        </p>
        <h1 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Página não encontrada
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          A página que você procura pode ter sido movida, excluída, ou talvez
          nunca tenha existido.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Ir para o painel
        </Link>
        <Link
          href="/encounters/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          + Novo atendimento
        </Link>
      </div>
    </main>
  );
}
