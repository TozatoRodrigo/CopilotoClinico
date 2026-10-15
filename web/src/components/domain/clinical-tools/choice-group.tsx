'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoiceGroupProps<T extends string> {
  /** Nome do grupo, lido pelo leitor de tela e mostrado acima das opções. */
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Esconde o rótulo visível (continua no nome acessível). */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Escolha única curta das Ferramentas (modo da droga, diluição, fase do
 * protocolo): rádio nativo, como os itens de escore — setas do teclado
 * funcionam e o leitor anuncia "1 de 2". Opções lado a lado quando cabem,
 * alvo de toque de 44px.
 */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
  className,
}: ChoiceGroupProps<T>) {
  const name = useId();
  return (
    <fieldset data-slot="choice-group" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend
        className={cn(
          'mb-1.5 text-[0.8125rem] font-medium text-muted-foreground',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </legend>
      <div
        className={cn(
          'grid gap-1.5',
          options.length === 2 && 'grid-cols-2',
          options.length >= 3 && 'grid-cols-1 sm:grid-cols-3',
        )}
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors duration-100 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                checked
                  ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                  : 'border-border bg-background text-foreground hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
