'use client';

/**
 * Peças compartilhadas das telas de entrada (login, cadastro, onboarding) no
 * estilo da tela de login do Notion: marca no topo, título negrito centrado,
 * subtítulo cinza e texto legal pequeno no rodapé da coluna.
 *
 * Client Component porque a marca usa ícones Phosphor (createContext) e o
 * layout de (auth) continua sendo Server Component.
 */
import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/** Barra superior mínima com a marca (sem link: não tira ninguém do fluxo). */
export function AuthTopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center px-4 sm:px-6">
      <Logo />
    </header>
  );
}

export function AuthHeading({
  title,
  description,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Substitui a marca (ex.: ícone de etapa no onboarding). */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-5 text-center', className)}>
      {icon ?? <LogoMark size="lg" />}
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl text-balance text-foreground sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="text-[0.9375rem] text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Mensagem de erro de campo, ligada ao input via `aria-describedby`. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs text-destructive">
      {children}
    </p>
  );
}

/** Link secundário em cinza (Notion: "Esqueceu a senha?", "Criar conta"). */
export const subtleLinkClass =
  'rounded-sm text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none';
