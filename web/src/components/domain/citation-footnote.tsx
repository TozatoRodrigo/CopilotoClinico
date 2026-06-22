import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Image, Table } from '@phosphor-icons/react';
import NextImage from 'next/image';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { EvidenceFigure, EvidenceTable } from '@/lib/types';

export interface CitationFootnoteProps {
  source: string;
  sourceVersion: string;
  text?: string;
  evidenceLevel?: string;
  href?: string;
  origin?: 'institutional' | 'public';
  evidenceFigure?: EvidenceFigure | null;
  evidenceTable?: EvidenceTable | null;
  className?: string;
}

export const CitationFootnote = memo(function CitationFootnote({
  source,
  sourceVersion,
  text,
  evidenceLevel,
  href,
  origin,
  evidenceFigure,
  evidenceTable,
  className,
}: CitationFootnoteProps) {
  return (
    <footer
      className={cn(
        'space-y-1 border-t border-dashed border-clinical-line pt-2 text-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          {source} <span className="font-mono text-xs text-muted-foreground">v{sourceVersion}</span>
        </span>
        {evidenceLevel && <Badge variant="outline">Evidência {evidenceLevel}</Badge>}
        {origin === 'institutional' && <Badge variant="secondary">Protocolo institucional</Badge>}
        {origin === 'public' && <Badge variant="outline">Diretriz pública</Badge>}
      </div>
      {text && <p className="line-clamp-2 text-muted-foreground">{text}</p>}
      {evidenceFigure && (
        <figure className="space-y-1">
          <a href={evidenceFigure.url} target="_blank" rel="noopener noreferrer">
            <NextImage
              src={evidenceFigure.url}
              alt={evidenceFigure.caption ?? `Figura de evidência — ${source}`}
              width={800}
              height={400}
              className="w-full rounded-lg border border-clinical-line"
              loading="lazy"
              unoptimized
            />
          </a>
          {evidenceFigure.caption && (
            <figcaption className="flex items-start gap-1 text-xs text-muted-foreground">
              <Image className="mt-0.5 size-3 shrink-0" />
              <span>{evidenceFigure.caption}</span>
            </figcaption>
          )}
        </figure>
      )}
      {evidenceTable && (
        <div className="space-y-1">
          {evidenceTable.caption && (
            <p className="flex items-start gap-1 text-xs text-muted-foreground">
              <Table className="mt-0.5 size-3 shrink-0" />
              <span>{evidenceTable.caption}</span>
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {evidenceTable.columns.map((col, i) => (
                    <th
                      key={i}
                      className="border border-clinical-line bg-muted/30 px-2 py-1 text-left font-medium text-foreground"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidenceTable.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="border border-clinical-line px-2 py-1 text-muted-foreground"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-clinical-teal underline underline-offset-4"
        >
          Ver trecho completo
        </a>
      )}
    </footer>
  );
});

export function CitationFootnoteSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2 border-t border-dashed border-clinical-line pt-2', className)}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}
