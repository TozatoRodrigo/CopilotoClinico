import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Disclosure } from '@/components/ui/disclosure';
import { ArrowSquareOut, Image as ImageIcon, Table } from '@phosphor-icons/react';
import NextImage from 'next/image';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { EvidenceFigure, EvidenceTable } from '@/lib/types';
import { SourceOriginBadge, type SourceOrigin } from '@/components/domain/source-origin-badge';

export interface CitationFootnoteProps {
  source: string;
  sourceVersion: string;
  text?: string;
  evidenceLevel?: string;
  href?: string;
  origin?: SourceOrigin;
  evidenceFigure?: EvidenceFigure | null;
  evidenceTable?: EvidenceTable | null;
  /** Número da nota de rodapé (o mesmo do sobrescrito na recomendação). */
  number?: number;
  /** Âncora para o sobrescrito da recomendação (`href="#…"`). */
  id?: string;
  className?: string;
}

/** "2024" vira "v2024"; "Portaria SECTICS/MS nº 83" fica como está. */
function formatVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

/**
 * Nota de rodapé do Notion: número, fonte, tags de origem/evidência e o
 * trecho citado como bloco de citação. Figura e tabela da evidência ficam
 * num toggle para não alongar a leitura do plano.
 */
export const CitationFootnote = memo(function CitationFootnote({
  source,
  sourceVersion,
  text,
  evidenceLevel,
  href,
  origin,
  evidenceFigure,
  evidenceTable,
  number,
  id,
  className,
}: CitationFootnoteProps) {
  return (
    <div
      id={id}
      data-slot="citation-footnote"
      className={cn('flex scroll-mt-16 gap-2.5 text-sm', className)}
    >
      {number !== undefined && (
        <span
          aria-hidden="true"
          className="w-5 shrink-0 pt-px text-right text-[0.8125rem] font-medium text-muted-foreground tabular-nums"
        >
          {number}.
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">
            {number !== undefined && <span className="sr-only">Fonte {number}: </span>}
            {source}
          </span>
          {sourceVersion && (
            <span className="text-xs text-muted-foreground">{formatVersion(sourceVersion)}</span>
          )}
          {evidenceLevel && <Badge variant="gray">Evidência {evidenceLevel}</Badge>}
          <SourceOriginBadge origin={origin} />
        </div>

        {text && (
          <blockquote className="line-clamp-3 border-l-[3px] border-foreground/15 pl-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {text}
          </blockquote>
        )}

        {evidenceFigure && (
          <Disclosure
            title={
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-normal text-muted-foreground">
                <ImageIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {evidenceFigure.caption ?? 'Figura da evidência'}
              </span>
            }
          >
            <a href={evidenceFigure.url} target="_blank" rel="noopener noreferrer">
              <NextImage
                src={evidenceFigure.url}
                alt={evidenceFigure.caption ?? `Figura de evidência — ${source}`}
                width={800}
                height={400}
                className="w-full rounded-md border border-border"
                loading="lazy"
                unoptimized
              />
            </a>
          </Disclosure>
        )}

        {evidenceTable && (
          <Disclosure
            title={
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-normal text-muted-foreground">
                <Table className="size-3.5 shrink-0" aria-hidden="true" />
                {evidenceTable.caption ?? 'Tabela da evidência'}
              </span>
            }
          >
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-subtle">
                    {evidenceTable.columns.map((col, i) => (
                      <th
                        key={i}
                        className="border-b border-border px-2.5 py-1.5 text-left font-medium text-muted-foreground"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {evidenceTable.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-2.5 py-1.5 text-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-[0.8125rem] text-link underline-offset-4 hover:underline"
          >
            Ver trecho completo
            <ArrowSquareOut className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
});

export function CitationFootnoteSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-2.5', className)}>
      <Skeleton className="h-4 w-5" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
