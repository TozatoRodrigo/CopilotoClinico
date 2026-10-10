import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Botões no estilo Notion: compactos (32px no desktop, 40px no toque),
// cantos de 6px, sem sombra difusa. `outline` é o botão secundário do Notion
// (fundo da página + contorno sutil); `ghost` é o item de hover do sidebar.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,border-color,background-color,box-shadow] duration-100 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_0_0_1px_rgba(15,15,15,0.1),0_1px_2px_rgba(15,15,15,0.1)] hover:bg-[var(--brand-hover)]',
        outline:
          'border-input bg-background text-foreground hover:bg-hover aria-expanded:bg-hover dark:bg-transparent',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-active aria-expanded:bg-active',
        ghost:
          'hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground',
        destructive:
          'border-destructive/40 bg-background text-destructive hover:bg-tone-red-bg focus-visible:ring-destructive/30 dark:bg-transparent',
        link: 'h-auto px-0 text-link underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-3 max-sm:h-10 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[0.8125rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-2 px-4 text-[0.9375rem] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-8 max-sm:size-10',
        'icon-xs': "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="absolute size-4" />}
          <span className={cn('contents', loading && 'invisible')}>{children}</span>
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
