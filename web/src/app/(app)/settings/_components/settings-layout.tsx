import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Blocos das Configurações no estilo do modal de Settings do Notion:
 * painel com título e descrição, seções com título e linhas
 * "título + descrição cinza ↔ controle" separadas por divisórias de 1px.
 */

export function SettingsPane({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        {description ? (
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      <div className="flex flex-col gap-0.5 border-b border-border pb-2.5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
          {title}
        </h3>
        {description ? (
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

/**
 * Linha de configuração: à esquerda o que é (título + explicação), à direita
 * o controle. No celular o controle desce para baixo do texto.
 * `htmlFor` liga o título ao campo quando o controle é um input/select.
 */
export function SettingsRow({
  title,
  description,
  htmlFor,
  control,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  control?: ReactNode;
  /** Conteúdo extra abaixo do texto (ex.: metadados). */
  children?: ReactNode;
  className?: string;
}) {
  const TitleTag = htmlFor ? 'label' : 'p';
  return (
    <div
      data-slot="settings-row"
      className={cn(
        'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8',
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <TitleTag
          {...(htmlFor ? { htmlFor } : {})}
          className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground"
        >
          {title}
        </TitleTag>
        {description ? (
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      {control ? <div className="flex shrink-0 items-center gap-2">{control}</div> : null}
    </div>
  );
}
