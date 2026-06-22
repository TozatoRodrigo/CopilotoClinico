/**
 * S22-NAV-01 — Breadcrumb leve (sem depender de shadcn Breadcrumb que é mais pesado).
 *
 * Renderiza uma trilha de navegação acessível (nav + ol) com separadores
 * CaretRight. O último item (página atual) recebe aria-current="page".
 *
 * Uso típico no fluxo de atendimento:
 *   <Breadcrumb items={[
 *     { label: 'Atendimentos', href: '/encounters' },
 *     { label: patientRef, href: `/encounters/${id}` },
 *     { label: 'Captura' },  // sem href = página atual
 *   ]} />
 */
import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  /** Se ausente, o item é tratado como página atual (último). */
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Trilha de navegação" className={cn('mb-3', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const isCurrent = isLast && !item.href;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              {idx > 0 && (
                <CaretRight className="size-3 text-muted-foreground/60" aria-hidden="true" />
              )}
              {item.href && !isCurrent ? (
                <Link
                  href={item.href}
                  className="truncate transition-colors hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'truncate',
                    isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
