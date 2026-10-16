'use client';

import { cn } from '@/lib/utils';

/**
 * Seletor de período no formato "segmented" do Notion (fundo cinza, item
 * ativo em cartão). Botões com `aria-pressed` — é um filtro, não uma aba.
 * Cresce para 40px no toque. Número = dias ("7d"); texto aparece como veio
 * ("24h", do painel de chamadas de IA).
 */
export function PeriodToggle<T extends number | string>({
  options,
  value,
  onChange,
  label = 'Período',
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (period: T) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex h-7 items-center gap-0.5 rounded-md bg-tone-gray-bg p-0.5 max-sm:h-10', className)}
    >
      {options.map((period) => {
        const active = period === value;
        return (
          <button
            key={period}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(period)}
            className={cn(
              'inline-flex h-full min-w-11 items-center justify-center rounded-[4px] px-2.5 text-[0.8125rem] font-medium tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              active
                ? 'bg-background text-foreground shadow-sm dark:bg-active'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {typeof period === 'number' ? `${period}d` : period}
          </button>
        );
      })}
    </div>
  );
}
