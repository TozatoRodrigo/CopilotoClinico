'use client';

/**
 * ThemeToggle compartilhado — usado em app-shell e admin-shell.
 *
 * Tech debt cleanup: antes havia duas implementações idênticas (uma em cada
 * shell) que diferiam só em `h-9 w-9` vs `h-8 w-8`. Agora é um componente
 * único com prop `size` ("default" | "sm").
 */
import { useTheme } from '@/components/providers/theme-provider';
import { MoonStars, Sun } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle({ size = 'default' }: { size?: 'default' | 'sm' }) {
  const { setTheme, resolvedTheme } = useTheme();

  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  if (!resolvedTheme) {
    return (
      <Button variant="ghost" size="icon" className={sizeClass}>
        <span className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={sizeClass}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-pressed={resolvedTheme === 'dark'}
      aria-label={
        resolvedTheme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'
      }
    >
      {resolvedTheme === 'dark' ? <MoonStars className="size-4" /> : <Sun className="size-4" />}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}
