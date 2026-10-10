import { Page } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";

/** Mesmo formato do Plantão: saudação, métricas, fila, resolvidos e casos piloto. */
export default function DashboardLoading() {
  return (
    <Page width="default">
      <span role="status" className="sr-only">
        Carregando plantão…
      </span>

      {/* Cabeçalho: data/saudação, título e ações */}
      <div
        className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6"
        aria-hidden="true"
      >
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-9 w-80 max-w-full md:h-10" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-md md:w-44 md:flex-none" />
          <Skeleton className="size-10 rounded-md md:w-28" />
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]" aria-hidden="true">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>

      {/* Fila do plantão */}
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="divide-y divide-border border-y border-border">
          {["w-3/5", "w-2/5", "w-1/2", "w-1/3"].map((width, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-3">
              <div className="flex w-16 flex-col gap-1.5 md:w-20">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className={`h-4 ${width}`} />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden h-5 w-20 rounded-[3px] md:block" />
              <Skeleton className="hidden h-3.5 w-16 md:block" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Resolvidos hoje */}
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-[60px] rounded-md" />
      </div>

      {/* Casos piloto */}
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      </div>
    </Page>
  );
}
