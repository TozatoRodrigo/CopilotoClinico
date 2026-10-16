'use client';

import type { ReactNode } from 'react';
import { Plus } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Tag de seleção do Notion como alternância: tracejada quando vazia, cor da
 * categoria/severidade + ícone quando marcada. `aria-pressed` comunica o
 * estado ao leitor de tela.
 */
export function ToggleTag({
  pressed,
  onClick,
  activeClassName,
  activeIcon,
  disabled,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  activeClassName: string;
  activeIcon: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[0.8125rem] transition-colors duration-100 select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50 max-sm:h-10 max-sm:px-3 [&_svg]:size-3.5 [&_svg]:shrink-0',
        pressed
          ? cn('border-transparent font-medium', activeClassName)
          : 'border-dashed border-input text-muted-foreground hover:bg-hover hover:text-foreground',
      )}
    >
      {pressed ? activeIcon : <Plus aria-hidden="true" />}
      {children}
    </button>
  );
}
