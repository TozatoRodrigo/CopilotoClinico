import { Page } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";

/** Página genérica do Notion: ícone, título, descrição e blocos de conteúdo. */
export default function AppLoading() {
  return (
    <Page width="default">
      <span role="status" className="sr-only">
        Carregando…
      </span>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="size-12 rounded-md md:size-14" />
        <Skeleton className="h-9 w-64 max-w-full md:h-10" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <div className="divide-y divide-border border-y border-border">
          {["w-3/5", "w-2/5", "w-1/2", "w-1/3"].map((width, i) => (
            <div key={i} className="flex h-10 items-center gap-3 px-2">
              <Skeleton className="size-4" />
              <Skeleton className={`h-3.5 ${width}`} />
              <Skeleton className="ml-auto h-5 w-16 rounded-[3px]" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5" aria-hidden="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </Page>
  );
}
