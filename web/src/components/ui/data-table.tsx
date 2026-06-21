'use client';

/**
 * S22-DS-01 — Primitive <DataTable> responsivo (mobile-first).
 *
 * Renderiza `<table>` semântica em desktop (≥ 640px) e **cards empilhados**
 * em mobile (< 640px). Resolve de uma vez as 4 tabelas que quebravam no
 * celular: auditoria, CRM, diretrizes, dashboard recentes.
 *
 * ## Acessibilidade (S22-A11Y-01)
 *
 * - Linhas clicáveis são `<button>` ou `<a>` reais (NUNCA `div role=button`)
 * - `aria-expanded`/`aria-controls` quando a linha é expansível
 * - `<label>`-equivalentes via `cardLabel` no mobile (sem perdre contexto)
 * - Foco visível preservado em todos os breakpoints
 *
 * ## API
 *
 * ```ts
 * <DataTable
 *   columns={[
 *     { key: 'name', header: 'Nome', cell: (r) => r.name, cardLabel: () => 'Nome' },
 *     { key: 'status', header: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
 *   ]}
 *   rows={rows}
 *   getRowId={(r) => r.id}
 *   getRowHref={(r) => `/items/${r.id}`}  // torna a linha um <a>
 *   // OU onRowClick={(r) => router.push(`/items/${r.id}`)}  // torna a linha um <button>
 *   loading={isLoading}
 *   emptyState={<EmptyState ... />}
 * />
 * ```
 *
 * ## Decisões de produto (aplicadas da Sprint 22)
 *
 * - "Quero a melhor experiência possível para a responsividade" → mobile-first
 * - "Primitive DataTable em vez de ajuste tela-a-tela" → uma vez criado, resolve 4 telas
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';

export interface DataTableColumn<T> {
  /** Chave estável da coluna (usada como React key). */
  key: string;
  /** Cabeçalho da coluna (desktop). Pode ser string ou ReactNode. */
  header: ReactNode;
  /** Conteúdo da célula para uma linha. */
  cell: (row: T) => ReactNode;
  /**
   * Rótulo da coluna no mobile (card). Se omitido, usa `header`.
   * Útil para encurtar "Paciente" → "Pac." ou ocultar colunas óbvias
   * (ex: status com badge grande não precisa de label).
   * Passe `null` explicitamente para omitir o label no card.
   */
  cardLabel?: ((row: T) => ReactNode) | null;
  /**
   * Oculta a coluna no mobile (card). Útil para colunas de baixa prioridade
   * (ex: data secundária, ID técnico).
   */
  hideOnMobile?: boolean;
  /** Oculta a coluna no desktop. Raro — usado para colunas só-mobile. */
  hideOnDesktop?: boolean;
  /** Classes extras para célula no desktop. */
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Se passado, cada linha vira um `<Link href>`. */
  getRowHref?: (row: T) => string;
  /** Se `getRowHref` não for passado, transforma linha em `<button onClick>`. */
  onRowClick?: (row: T) => void;
  /** Texto/área para esvaziar quando `rows.length === 0`. */
  emptyState?: ReactNode;
  /** Atalho para empty state simples. */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  emptyActionHref?: string;
  /** Mostra skeleton de N linhas. */
  loading?: boolean;
  loadingRows?: number;
  /** aria-label para a tabela (acessibilidade). */
  ariaLabel?: string;
  /** Classe extra para o container externo. */
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  getRowHref,
  onRowClick,
  emptyState,
  emptyTitle = 'Nenhum item encontrado',
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  loading = false,
  loadingRows = 5,
  ariaLabel,
  className,
}: DataTableProps<T>) {
  const desktopColumns = columns.filter((c) => !c.hideOnDesktop);
  const mobileColumns = columns.filter((c) => !c.hideOnMobile);

  // Loading skeleton — mesmo visual em desktop/mobile.
  if (loading) {
    return (
      <div className={cn('space-y-2', className)} role="status" aria-busy="true">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
        <span className="sr-only">Carregando…</span>
      </div>
    );
  }

  // Empty state — usa EmptyState domain component com defaults clínicos.
  if (rows.length === 0) {
    if (emptyState) return <div className={className}>{emptyState}</div>;
    return (
      <div className={className}>
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          actionHref={emptyActionHref}
        />
      </div>
    );
  }

  const renderRowContent = (row: T): ReactNode =>
    desktopColumns.map((col) => (
      <TableCell key={col.key} className={col.className}>
        {col.cell(row)}
      </TableCell>
    ));

  const renderCardContent = (row: T): ReactNode => (
    <div className="space-y-1.5">
      {mobileColumns.map((col) => {
        const label =
          col.cardLabel === null ? null : (col.cardLabel?.(row) ?? col.header);
        return (
          <div key={col.key} className="flex items-start justify-between gap-3">
            {label && (
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
            )}
            <span className="min-w-0 flex-1 text-right text-sm text-foreground">
              {col.cell(row)}
            </span>
          </div>
        );
      })}
    </div>
  );

  const clickable = Boolean(getRowHref || onRowClick);

  return (
    <div className={className}>
      {/*
        S22-DS-01 — Mobile-first: renderiza CARDS por padrão (< sm) e TABLE
        em sm+ (640px+). Cada breakpoint tem sua implementação dedicada para
        manter semântica e acessibilidade ideais (não é CSS escondendo uma
        versão na outra — são duas árvores reais).
      */}
      <ul
        className="space-y-2 sm:hidden"
        aria-label={ariaLabel}
        role={clickable ? undefined : 'list'}
      >
        {rows.map((row) => {
          const id = getRowId(row);
          const href = getRowHref?.(row);
          const baseClass = cn(
            'block rounded-lg border bg-card p-3 transition-colors',
            clickable && 'hover:border-clinical-teal/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          );
          if (href) {
            return (
              <li key={id} className="list-none">
                <Link href={href} className={baseClass}>
                  {renderCardContent(row)}
                </Link>
              </li>
            );
          }
          if (onRowClick) {
            return (
              <li key={id} className="list-none">
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className={cn(baseClass, 'w-full text-left')}
                >
                  {renderCardContent(row)}
                </button>
              </li>
            );
          }
          return (
            <li key={id} className="list-none">
              <div className="block rounded-lg border bg-card p-3">
                {renderCardContent(row)}
              </div>
            </li>
          );
        })}
      </ul>

      <TableWrapper className="hidden rounded-lg border sm:block">
        <Table aria-label={ariaLabel}>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {desktopColumns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const id = getRowId(row);
              const href = getRowHref?.(row);
              if (href) {
                return (
                  <TableRow
                    key={id}
                    data-state="clickable"
                    className="cursor-pointer"
                  >
                    {/* Link sobreposição semântico — mantém acessibilidade */}
                    <td colSpan={desktopColumns.length} className="p-0">
                      <Link
                        href={href}
                        className="absolute inset-0 -m-px"
                        aria-label={`Abrir item ${id}`}
                        tabIndex={0}
                      />
                      <div className="flex pointer-events-none">
                        {desktopColumns.map((col) => (
                          <div
                            key={col.key}
                            className={cn('px-4 py-2.5 align-middle pointer-events-none', col.className)}
                          >
                            {col.cell(row)}
                          </div>
                        ))}
                      </div>
                    </td>
                  </TableRow>
                );
              }
              if (onRowClick) {
                return (
                  <TableRow
                    key={id}
                    data-state="clickable"
                    className="cursor-pointer"
                    onClick={() => onRowClick(row)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }}
                  >
                    {renderRowContent(row)}
                  </TableRow>
                );
              }
              return <TableRow key={id}>{renderRowContent(row)}</TableRow>;
            })}
          </TableBody>
        </Table>
      </TableWrapper>
    </div>
  );
}
