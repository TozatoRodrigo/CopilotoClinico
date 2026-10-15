'use client';

import { useId, type KeyboardEvent } from 'react';
import {
  BROSELOW_COLORS,
  describeBroselowAge,
  type BroselowKey,
} from '@clinical-tools/pediatrics/broselow';
import { formatCompact } from '@clinical-tools/numbers';
import { cn } from '@/lib/utils';

/**
 * Amostra de cada faixa da fita com os tokens de tom do design system. É só
 * a cor da fita física (não tem significado clínico): vai sempre junto do
 * nome, e o branco ganha borda para aparecer no fundo claro.
 */
export const BROSELOW_SWATCH: Record<BroselowKey, string> = {
  gray: 'bg-tone-gray',
  pink: 'bg-tone-pink',
  red: 'bg-tone-red',
  purple: 'bg-tone-purple',
  yellow: 'bg-tone-yellow',
  white: 'bg-background ring-1 ring-muted-foreground/50 ring-inset',
  blue: 'bg-tone-blue',
  orange: 'bg-tone-orange',
  green: 'bg-tone-green',
};

export function BroselowSwatch({
  colorKey,
  className,
}: {
  colorKey: BroselowKey;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-4 shrink-0 rounded-[3px]',
        BROSELOW_SWATCH[colorKey],
        className,
      )}
    />
  );
}

export interface BroselowPickerProps {
  value: BroselowKey | null;
  onChange: (key: BroselowKey | null) => void;
  /** Cor que o peso digitado aponta (só mostra, não escolhe). */
  suggested?: BroselowKey | null;
  className?: string;
}

/**
 * Escolha da cor de Broselow (CC-319): nove botões de rádio com cor, peso,
 * idade e faixa de comprimento. Tocar de novo na cor escolhida desfaz a
 * escolha. Setas movem entre as cores, como num grupo de rádio.
 */
export function BroselowPicker({ value, onChange, suggested, className }: BroselowPickerProps) {
  const labelId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = BROSELOW_COLORS[(index + step + BROSELOW_COLORS.length) % BROSELOW_COLORS.length];
    if (!next) return;
    onChange(next.key);
    const sibling = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `[data-broselow="${next.key}"]`,
    );
    sibling?.focus();
  }

  const focusable = value ?? BROSELOW_COLORS[0]?.key;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span id={labelId} className="text-[0.8125rem] font-medium text-muted-foreground">
        Cor de Broselow
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-1.5">
        {BROSELOW_COLORS.map((color, index) => {
          const checked = value === color.key;
          const hinted = !value && suggested === color.key;
          return (
            <button
              key={color.key}
              type="button"
              role="radio"
              aria-checked={checked}
              data-broselow={color.key}
              tabIndex={color.key === focusable ? 0 : -1}
              onClick={() => onChange(checked ? null : color.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              title={`${color.lengthCm.min}–${color.lengthCm.max} cm · ${describeBroselowAge(color.ageMonths)}`}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                checked
                  ? 'border-foreground bg-surface-subtle font-medium text-foreground'
                  : 'border-border text-foreground hover:bg-hover',
                hinted && 'border-dashed border-foreground/60',
              )}
            >
              <BroselowSwatch colorKey={color.key} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{color.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatCompact(color.weightKg)} kg
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
