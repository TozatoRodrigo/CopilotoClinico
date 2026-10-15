'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Linha de apoio abaixo do rótulo ("Paciente já em VNI: verificar resposta"). */
  description?: string;
}

/** Opções do motor, que usam `id` (`SEXES`, `MEMBRANE_METHODS`), no formato do grupo. */
export function choicesFromIds<T extends string>(
  items: readonly { id: T; label: string; description?: string }[],
): ChoiceOption<T>[] {
  return items.map(({ id, label, description }) => ({ value: id, label, description }));
}

export type ChoiceColumns = 2 | 3 | 4;

export interface ChoiceGroupProps<T extends string> {
  /** Nome do grupo, lido pelo leitor de tela e mostrado acima das opções. */
  label: ReactNode;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /**
   * Campo opcional: tocar de novo na opção escolhida desmarca, como deixar o
   * campo em branco (lateralidade da nota do bloqueio). Sem `onClear`, a
   * escolha só troca.
   */
  onClear?: () => void;
  /** Esconde o rótulo visível (continua no nome acessível). */
  hideLabel?: boolean;
  /**
   * Colunas no celular. Sem isso, opções curtas ficam lado a lado e as longas
   * (ou com descrição) empilham no celular e se alinham a partir de `sm`.
   */
  columns?: ChoiceColumns;
  className?: string;
}

const COLUMNS: Record<ChoiceColumns, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/** Rótulo que cabe lado a lado no celular ("Não", "Sim", "Cormack 2"). */
const SHORT_LABEL = 14;

function defaultColumns(options: readonly ChoiceOption<string>[]): string {
  const compact = options.every(
    ({ label, description }) => label.length <= SHORT_LABEL && !description,
  );
  const count = options.length;
  if (compact)
    return count <= 3 ? cn(count === 2 && 'grid-cols-2', count === 3 && 'grid-cols-3') : COLUMNS[4];
  return cn('grid-cols-1', count === 2 ? 'sm:grid-cols-2' : count >= 3 && 'sm:grid-cols-3');
}

/**
 * Escolha única das Ferramentas (modo da droga, fase do protocolo, "responsivo
 * a fluidos?", Cormack-Lehane, momento do HACOR): rádio nativo, como os itens
 * de escore — setas do teclado funcionam e o leitor anuncia "1 de 2". Alvo de
 * toque de 44px. É o único seletor de opção das ferramentas: os roteiros não
 * criam o seu.
 */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  onClear,
  hideLabel = false,
  columns,
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
      <div className={cn('grid gap-1.5', columns ? COLUMNS[columns] : defaultColumns(options))}>
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
                // O rádio não dispara `change` ao tocar no já marcado; o clique sim.
                onClick={() => {
                  if (checked && onClear) onClear();
                }}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>{option.label}</span>
                {option.description ? (
                  <span
                    className={cn(
                      'text-xs font-normal',
                      checked ? 'text-tone-blue-ink' : 'text-muted-foreground',
                    )}
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
