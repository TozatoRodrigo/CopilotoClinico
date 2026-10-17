'use client';

import type { ReactNode } from 'react';
import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Cartão de opção selecionável (rádio nativo escondido): borda sutil, hover
 * cinza, selecionado = anel azul + check. Setas do teclado navegam entre as
 * opções como em qualquer grupo de rádio. Usado no onboarding (especialidade)
 * e no perfil do beta (CC-702).
 */
export function OptionCard({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm leading-snug transition-colors duration-100 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
        checked
          ? 'border-primary bg-tone-blue-bg font-medium text-foreground ring-1 ring-primary'
          : 'border-border text-foreground hover:bg-hover',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="min-w-0 flex-1">{children}</span>
      {checked && (
        <Check className="size-4 shrink-0 text-primary" weight="bold" aria-hidden="true" />
      )}
    </label>
  );
}
