import type { ReactNode } from 'react';
import { SectionHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

/**
 * Blocos da vitrine do design system (/dev/components). Cada seção é um H2
 * do Notion com âncora; cada exemplo é um "specimen": título curto, nota de
 * uso e o componente renderizado numa área com contorno de 1px.
 */

export interface ShowcaseAnchor {
  id: string;
  label: string;
}

export function ShowcaseSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-8 flex-col gap-5">
      <SectionHeader
        title={<span id={`${id}-title`}>{title}</span>}
        description={description}
        className="border-b border-border pb-2"
      />
      {children}
    </section>
  );
}

export function Specimen({
  title,
  note,
  children,
  className,
  bare = false,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sem contorno (para componentes que já têm a própria superfície). */
  bare?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {note ? <p className="text-[0.8125rem] text-pretty text-muted-foreground">{note}</p> : null}
      </div>
      <div className={cn(!bare && 'rounded-lg border border-border p-4 sm:p-5', className)}>{children}</div>
    </div>
  );
}

/** Nome de token/classe em código (mono é permitido para código). */
export function Token({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-tone-gray-bg px-1 py-0.5 font-mono text-[0.75rem] text-foreground">
      {children}
    </code>
  );
}

/** Amostra de cor de superfície/linha com o nome do token. */
export function Swatch({
  className,
  label,
  token,
}: {
  className: string;
  label: string;
  token: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={cn('h-14 rounded-md border border-border', className)} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-[0.75rem] text-muted-foreground">{token}</p>
      </div>
    </div>
  );
}

/** Índice no topo da página, como o bloco "Table of contents" do Notion. */
export function TableOfContents({ anchors }: { anchors: ShowcaseAnchor[] }) {
  return (
    <nav aria-label="Índice da vitrine" className="rounded-lg bg-surface-subtle px-3 py-2.5">
      <ol className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 md:grid-cols-4">
        {anchors.map((anchor) => (
          <li key={anchor.id}>
            <a
              href={`#${anchor.id}`}
              className="block truncate rounded-sm px-1.5 py-1 text-[0.8125rem] text-muted-foreground underline-offset-2 transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:py-2.5"
            >
              {anchor.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
