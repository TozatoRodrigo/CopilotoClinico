/**
 * S22-NAV-01 — Trilha de navegação no estilo do topo de página do Notion:
 * itens com ícone opcional, separador "/", hover com fundo sutil.
 *
 * O AppShell já renderiza a trilha da rota atual na barra superior; use este
 * componente em páginas só quando precisar de uma trilha diferente da rota.
 */
import Link from 'next/link';
import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  /** Se ausente, o item é tratado como página atual (último). */
  href?: string;
  icon?: ElementType;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Trilha de navegação" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-0.5 text-sm text-muted-foreground">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const isCurrent = isLast && !item.href;
          const Icon = item.icon;
          const content = (
            <>
              {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
              <span className="truncate">{item.label}</span>
            </>
          );
          return (
            <li
              key={`${item.label}-${idx}`}
              className={cn('flex min-w-0 items-center gap-0.5', isLast ? 'shrink' : 'shrink-[2]')}
            >
              {idx > 0 && (
                <span className="px-0.5 text-fg-tertiary" aria-hidden="true">
                  /
                </span>
              )}
              {item.href && !isCurrent ? (
                <Link
                  href={item.href}
                  className="flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-hover hover:text-foreground"
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 px-1.5 py-0.5',
                    isCurrent && 'text-foreground',
                  )}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
