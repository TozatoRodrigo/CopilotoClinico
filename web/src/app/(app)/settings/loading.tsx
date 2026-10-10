/**
 * S22-UX-01 — Loading skeleton para Configurações.
 *
 * Espelha o layout da página: cabeçalho, navegação de seções (vertical no
 * desktop, abas no celular) e linhas de configuração do painel ativo.
 */
import { Page } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <Page width="default">
      <div className="flex flex-col gap-3">
        <Skeleton className="size-12 md:size-14" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <div className="flex gap-2 md:w-48 md:flex-col md:gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 md:w-full" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Skeleton className="h-6 w-40" />
          <div className="divide-y divide-border border-t border-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-6 py-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full max-w-sm" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}
