import { Skeleton } from '@/components/ui/skeleton';
import { Page } from '@/components/layout/page';

/**
 * Esqueleto da página de análise — mesma silhueta do resultado (etapas,
 * título, propriedades, perguntas, plano), para a troca não "pular".
 * Usado pelo loading.tsx da rota e pelo estado pendente da query.
 */
export function ResultSkeleton() {
  return (
    <Page width="narrow">
      <span className="sr-only" role="status">
        Carregando a análise do copiloto…
      </span>
      <Skeleton className="h-6 w-64" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-3/4" />
        <div className="flex flex-col gap-2 pt-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-48" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-28 w-full rounded-md" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3 border-b border-border pb-3">
            <Skeleton className="mt-1 size-4 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-7 w-56" />
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
