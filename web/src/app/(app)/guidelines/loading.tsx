/**
 * S22-UX-01 — Loading skeleton para a biblioteca de diretrizes.
 * Espelha a página: ícone + título, busca em destaque e linhas da database.
 */
import { Page } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

export default function GuidelinesLoading() {
  return (
    <Page width="default">
      <div className="flex flex-col gap-3">
        <Skeleton className="size-12 md:size-14" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg md:h-14" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20" />
          ))}
        </div>
        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 px-2 py-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
