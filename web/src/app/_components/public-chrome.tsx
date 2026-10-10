'use client';

/**
 * Moldura das páginas públicas (landing, /privacidade, 404) no estilo do
 * site do Notion: barra fina com a marca à esquerda e as ações de entrada à
 * direita; rodapé mínimo com links legais.
 *
 * Client Component porque a marca usa ícones Phosphor (dependem de
 * createContext) — páginas servidor como /privacidade e not-found renderizam
 * estes componentes sem precisar virar client.
 */
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const brandLinkClass =
  '-mx-1 flex items-center rounded-md px-1 py-1 outline-none transition-colors hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40';

export function PublicHeader({
  showAuthActions = true,
  className,
}: {
  /** Mostra "Entrar" e "Criar conta" à direita. */
  showAuthActions?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className={brandLinkClass}>
          <Logo />
        </Link>
        <div className="flex-1" />
        {showAuthActions && (
          <nav aria-label="Acesso" className="flex items-center gap-1.5">
            <Button asChild variant="ghost">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Criar conta</Link>
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}

const footerLinkClass =
  'rounded-sm px-1 py-0.5 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:py-2.5';

export function PublicFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border', className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[0.8125rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Logo size="sm" />
          <span>© {new Date().getFullYear()} Strivium</span>
        </div>
        <nav aria-label="Rodapé" className="-mx-1 flex flex-wrap items-center gap-x-4">
          <Link href="/privacidade" className={footerLinkClass}>
            Privacidade
          </Link>
          <Link href="/login" className={footerLinkClass}>
            Entrar
          </Link>
          <Link href="/register" className={footerLinkClass}>
            Criar conta
          </Link>
        </nav>
      </div>
    </footer>
  );
}
