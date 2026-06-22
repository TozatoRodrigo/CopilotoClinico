/**
 * S22-UX-01 — Loading skeleton para o grupo (admin).
 *
 * Cobertura padrão para todas as rotas administrativas que não têm
 * loading.tsx próprio. Evita "flash" de tela vazia durante a navegação
 * entre o console admin.
 */
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
