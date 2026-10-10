import type { ReactNode } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Métrica do console no formato do `StatCard` (bloco do Notion), com estado
 * de carregamento e um tom de alerta. `highlight` (azul) marca a métrica
 * principal da seção; `warning` (laranja) marca a que pede ação — sempre com
 * ícone, nunca só cor.
 */
export function Metric({
  label,
  value,
  sub,
  loading = false,
  tone = 'default',
  badge,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  loading?: boolean;
  tone?: 'default' | 'highlight' | 'warning';
  /** Tag curta à direita do valor (ex.: "métrica nº 1"). */
  badge?: ReactNode;
  /** Conteúdo extra no rodapé (ex.: medidor). */
  children?: ReactNode;
  className?: string;
}) {
  const tinted = tone !== 'default';
  return (
    <div
      data-slot="metric"
      className={cn(
        'flex min-h-[104px] flex-col gap-2 rounded-lg px-4 py-3.5',
        tone === 'highlight' && 'bg-tone-blue-bg text-tone-blue-ink',
        tone === 'warning' && 'bg-tone-orange-bg text-tone-orange-ink',
        tone === 'default' && 'border border-border bg-card text-foreground',
        className,
      )}
    >
      <span className={cn('flex items-start gap-1.5 text-sm', tinted ? 'opacity-90' : 'text-muted-foreground')}>
        {tone === 'warning' && (
          <WarningCircle className="mt-0.5 size-4 shrink-0 text-tone-orange" weight="fill" aria-hidden="true" />
        )}
        {label}
      </span>
      {loading ? (
        <Skeleton className={cn('h-8 w-20', tinted && 'bg-background/60')} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[1.75rem] leading-none font-semibold tracking-[-0.02em]">{value}</span>
          {badge}
        </div>
      )}
      {sub && !loading ? (
        <span className={cn('text-xs', tinted ? 'opacity-85' : 'text-muted-foreground')}>{sub}</span>
      ) : null}
      {children && !loading ? <div className="mt-auto pt-1">{children}</div> : null}
    </div>
  );
}
