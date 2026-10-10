import { Page } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto da página de Auditoria — mesmo layout do database (page.tsx). */
export default function AuditLoading() {
  return (
    <Page width="wide">
      <div className="flex flex-col gap-3">
        <Skeleton className="size-12 md:size-14" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>

      <Skeleton className="h-[4.5rem] w-full rounded-md" />

      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-12" />
            ))}
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-12 w-36" />
          <Skeleton className="h-12 w-36" />
          <Skeleton className="h-7 w-20" />
        </div>

        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-2.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-24 max-md:hidden" />
              <Skeleton className="ml-auto h-5 w-32" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        Carregando auditoria…
      </span>
    </Page>
  );
}
