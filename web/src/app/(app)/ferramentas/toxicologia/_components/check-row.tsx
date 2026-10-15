'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Linha de marcar (critério de destino, item do checklist): caixa nativa —
 * espaço marca, leitor de tela anuncia "marcado" — com a linha inteira como
 * alvo de toque de 48px e a explicação abaixo do rótulo.
 */
export function CheckRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 transition-colors duration-75 hover:bg-hover has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
        checked && 'bg-tone-blue-bg hover:bg-tone-blue-bg',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description ? (
          <span className="block text-[0.8125rem] text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
