/**
 * S22-UX-01 — Loading skeleton para Configurações.
 *
 * Como a página usa Tabs, o skeleton simula o cabeçalho + o conteúdo
 * do tab ativo (sem saber qual é, mostra cards genéricos).
 */
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
