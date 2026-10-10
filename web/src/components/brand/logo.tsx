import { Stethoscope } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * Marca do Copiloto Clínico no espírito do logo do Notion: quadrado de cantos
 * suaves com contorno grosso na cor do texto e o glifo ao centro. Monocromática
 * — herda a cor do tema e funciona em claro/escuro.
 */
export function LogoMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = { sm: 'size-5 rounded-[5px] border-[1.5px]', md: 'size-6 rounded-[6px] border-2', lg: 'size-10 rounded-[9px] border-[2.5px]' }[size];
  const glyph = { sm: 'size-3', md: 'size-3.5', lg: 'size-6' }[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center border-foreground bg-background text-foreground',
        box,
        className,
      )}
    >
      <Stethoscope className={glyph} weight="bold" />
    </span>
  );
}

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          'font-semibold tracking-[-0.01em] text-foreground',
          size === 'lg' ? 'text-xl' : 'text-[0.9375rem]',
        )}
      >
        Copiloto Clínico
      </span>
    </span>
  );
}
