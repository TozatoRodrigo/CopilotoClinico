'use client';

import type { ElementType } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Pílula de filtro de database do Notion ("Vertical: Trauma ▾").
 *
 * S22-A11Y-02 — por baixo continua um <select> nativo (com <label>
 * associado): no celular o seletor nativo é mais acessível que um listbox
 * customizado para o teclado/VoiceOver do iOS. O <select> fica invisível por
 * cima da pílula e recebe o clique/foco; a pílula só desenha o estado.
 */
export function FilterPill({
  id,
  label,
  srLabel,
  icon: Icon,
  value,
  valueLabel,
  options,
  onChange,
  active,
}: {
  id: string;
  /** Nome curto do filtro exibido na pílula ("Vertical"). */
  label: string;
  /** Rótulo acessível do <select> ("Filtrar por vertical"). */
  srLabel: string;
  icon?: ElementType;
  value: string;
  /** Texto do valor ativo; por padrão, o rótulo da opção selecionada. */
  valueLabel?: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Por padrão, ativo quando `value` não é vazio. */
  active?: boolean;
}) {
  const isActive = active ?? value !== '';
  const display = valueLabel ?? options.find((option) => option.value === value)?.label;

  return (
    <div
      className={cn(
        'relative inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[0.8125rem] transition-colors duration-100 has-[select:focus-visible]:ring-[3px] has-[select:focus-visible]:ring-ring/40 max-sm:h-10 max-sm:px-3.5',
        isActive
          ? 'border-transparent bg-active text-foreground'
          : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground',
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      <span aria-hidden="true" className="whitespace-nowrap">
        {label}
        {isActive && display ? (
          <>
            : <span className="font-medium">{display}</span>
          </>
        ) : null}
      </span>
      <CaretDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {srLabel}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
