'use client';

import { useTheme } from '@/components/providers/theme-provider';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CheckCircle, Info, Warning, XCircle, CircleNotch } from '@phosphor-icons/react';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      closeButton
      icons={{
        success: <CheckCircle className="size-[18px]" aria-hidden="true" />,
        info: <Info className="size-[18px]" aria-hidden="true" />,
        warning: <Warning className="size-[18px]" aria-hidden="true" />,
        error: <XCircle className="size-[18px]" aria-hidden="true" />,
        loading: <CircleNotch className="size-[18px] animate-spin" aria-hidden="true" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
