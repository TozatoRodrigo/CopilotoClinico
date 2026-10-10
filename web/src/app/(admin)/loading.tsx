/**
 * S22-UX-01 — Loading skeleton para o grupo (admin).
 *
 * Cobertura padrão para todas as rotas administrativas que não têm
 * loading.tsx próprio. Evita "flash" de tela vazia durante a navegação
 * entre o console admin. Espelha a anatomia da página do Notion: ícone,
 * título, descrição, faixa de métricas e linhas de database.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { Page } from '@/components/layout/page';

export default function AdminLoading() {
  return (
    <Page width="default">
      <div className="flex flex-col gap-3" role="status" aria-busy="true">
        <Skeleton className="size-12 rounded-md md:size-14" />
        <Skeleton className="h-9 w-56 md:h-10" />
        <Skeleton className="h-4 w-full max-w-md" />
        <span className="sr-only">Carregando console…</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_2fr]">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <div className="divide-y divide-border border-y border-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
