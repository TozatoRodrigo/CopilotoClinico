/**
 * Primitivos de tabela no estilo "database" do Notion — linhas finas
 * horizontais e verticais, cabeçalho em texto cinza sem caixa-alta, hover
 * sutil na linha. Sem contorno arredondado: a tabela "pertence" à página.
 *
 * S22-DS-01 — base do primitive <DataTable> responsivo.
 */
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function TableWrapper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative w-full overflow-x-auto', className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      data-slot="table"
      className={cn('w-full caption-bottom border-y border-border text-sm', className)}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:hover:bg-transparent', className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t bg-surface-subtle font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors duration-75 hover:bg-hover/60 data-[state=selected]:bg-[var(--brand-soft)]',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-9 px-2 text-left align-middle text-sm font-normal whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-border',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'h-9 px-2 py-1.5 align-middle [&:has([role=checkbox])]:pr-0 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-border',
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 text-left text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}
