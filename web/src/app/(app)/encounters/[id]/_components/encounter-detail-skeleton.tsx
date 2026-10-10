import { Page } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PageHeaderSkeleton } from '../../_components/skeletons';

const PROPERTY_VALUE_WIDTHS = ['w-28', 'w-20', 'w-16', 'w-24', 'w-56', 'w-40'] as const;

/**
 * Formato da página do caso: ícone + título + ações, propriedades, linha do
 * tempo e documentos. Usado no loading.tsx da rota e no estado pendente da
 * própria página (mesma forma nos dois, sem "pulo").
 */
export function EncounterDetailSkeleton() {
  return (
    <Page width="default">
      <span role="status" className="sr-only">
        Carregando caso…
      </span>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <PageHeaderSkeleton description={false} actions />
        <div className="flex flex-col gap-0.5 pt-1">
          {PROPERTY_VALUE_WIDTHS.map((width, i) => (
            <div
              key={i}
              className="grid min-h-[34px] grid-cols-[minmax(7.5rem,10rem)_1fr] items-center gap-2 sm:grid-cols-[10rem_1fr]"
            >
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-4" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <Skeleton className={cn('ml-1.5 h-4', width)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_1fr] gap-x-3">
              <Skeleton className="size-6 rounded-full" />
              <div className="flex items-center justify-between gap-4 pt-1">
                <Skeleton className={cn('h-4', i === 1 ? 'w-48' : 'w-36')} />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-5 w-28" />
        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-3">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ml-auto h-5 w-20 rounded-[3px]" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
