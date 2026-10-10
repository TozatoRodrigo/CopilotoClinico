import { Page } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Skeletons no formato das páginas do Notion (ícone, título, propriedades,
 * linhas de database) — o layout não "pula" quando os dados chegam.
 * Larguras fixas variadas para parecer conteúdo real sem aleatoriedade (SSR).
 */

const TITLE_WIDTHS = ['w-64', 'w-48', 'w-56', 'w-40', 'w-60', 'w-44', 'w-52', 'w-36'] as const;

export function PageHeaderSkeleton({
  icon = true,
  description = true,
  actions = false,
}: {
  icon?: boolean;
  description?: boolean;
  actions?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {icon ? <Skeleton className="size-12 rounded-md md:size-14" /> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex w-full flex-col gap-2.5">
          <Skeleton className="h-9 w-56 max-w-full md:h-10" />
          {description ? <Skeleton className="h-4 w-96 max-w-full" /> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Linhas da database de casos (tabela no desktop, lista no mobile). */
export function EncountersTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Carregando casos…</span>
      <div className="hidden border-y border-border sm:block" aria-hidden="true">
        <div className="flex h-9 items-center gap-6 border-b border-border px-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="ml-auto h-3 w-14" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex h-9 items-center gap-6 border-b border-border px-2 last:border-b-0"
          >
            <div className="flex flex-1 items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className={cn('h-3.5', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
            </div>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-5 w-16 rounded-[3px]" />
            <Skeleton className="h-5 w-14 rounded-[3px]" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-border border-y border-border sm:hidden" aria-hidden="true">
        {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 px-1 py-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className={cn('h-4', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
              <Skeleton className="h-5 w-16 rounded-[3px]" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Página /encounters inteira: cabeçalho, barra de views/filtros e tabela. */
export function EncountersPageSkeleton() {
  return (
    <Page width="wide">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:border-b sm:border-border">
          <div className="flex h-9 items-center gap-4 border-b border-border max-sm:w-full sm:border-b-0">
            {['w-12', 'w-20', 'w-20', 'w-16', 'w-20'].map((w, i) => (
              <Skeleton key={i} className={cn('h-3.5', w)} />
            ))}
          </div>
          <div className="flex items-center gap-2 sm:py-1">
            <Skeleton className="h-7 flex-1 rounded-md max-sm:h-10 sm:w-56" />
            <Skeleton className="h-7 w-16 rounded-md max-sm:h-10" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <EncountersTableSkeleton />
      </div>
    </Page>
  );
}

/** Página genérica (fallback do layout de /encounters). */
export function NotionPageSkeleton({ width = 'default' }: { width?: 'narrow' | 'default' | 'wide' }) {
  return (
    <Page width={width}>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-2.5" aria-hidden="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <span role="status" className="sr-only">
        Carregando…
      </span>
    </Page>
  );
}
