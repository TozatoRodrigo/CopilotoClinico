'use client';

import type { ReactNode } from 'react';
import { ArrowSquareOut, Warning } from '@phosphor-icons/react';
import type { KnowledgeCardSource } from '@contracts/knowledge-cards';
import type {
  KnowledgeCardSourceText,
  KnowledgeCardTextRange,
} from '@contracts/knowledge-card-review';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { SectionHeader } from '@/components/layout/page-header';

/** Âncora de cada fonte na página, para o botão "S1" da citação levar até ela. */
export function sourceAnchorId(key: string): string {
  return `fonte-${key}`;
}

/** Texto da fonte com os trechos citados marcados (`<mark>`), quebras de linha preservadas. */
export function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: readonly KnowledgeCardTextRange[];
}) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of highlights) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={range.start} className="rounded-sm bg-tone-yellow-tag px-0.5 text-tone-yellow-ink">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <p className="font-serif text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">
      {parts}
    </p>
  );
}

/**
 * CC-404 — as fontes do cartão com o texto integral do trecho de diretriz e
 * o que o cartão cita marcado. É aqui que o revisor confere se a citação diz
 * o que o cartão afirma, no contexto (a dose da linha certa da tabela).
 */
export function CardSources({
  sources,
  sourceTexts,
  openKeys,
  onOpenChange,
}: {
  sources: readonly KnowledgeCardSource[];
  sourceTexts: readonly KnowledgeCardSourceText[];
  openKeys: ReadonlySet<string>;
  onOpenChange: (key: string, open: boolean) => void;
}) {
  return (
    <section aria-labelledby="card-sources-title" className="flex flex-col gap-2">
      <SectionHeader
        as="h3"
        title={<span id="card-sources-title">Fontes</span>}
        count={sources.length}
        description="Trechos citados marcados no texto da diretriz."
      />
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {sources.map((source) => {
          const sourceText = sourceTexts.find((candidate) => candidate.key === source.key);
          const citedCount = sourceText?.highlights.length ?? 0;
          return (
            <li key={source.key} id={sourceAnchorId(source.key)} className="scroll-mt-16 py-1">
              <Disclosure
                open={openKeys.has(source.key)}
                onOpenChange={(open) => onOpenChange(source.key, open)}
                title={
                  <span className="flex min-w-0 items-start gap-1.5">
                    <Badge variant="gray" className="mt-px">
                      {source.key}
                    </Badge>
                    <span className="min-w-0">{source.title}</span>
                  </span>
                }
                meta={
                  citedCount > 0 ? `${citedCount} trecho${citedCount > 1 ? 's' : ''}` : undefined
                }
              >
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">
                    Versão {source.sourceVersion}
                    {source.section ? ` · ${source.section}` : ''}
                  </p>
                  {sourceText && !sourceText.matchesCitedText && sourceText.text !== null && (
                    <Callout tone="orange" icon={<Warning weight="bold" />}>
                      O texto desta fonte mudou depois que o cartão foi escrito. Confira o trecho
                      com atenção.
                    </Callout>
                  )}
                  {sourceText?.text ? (
                    <HighlightedText text={sourceText.text} highlights={sourceText.highlights} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      O texto deste trecho de diretriz não está mais disponível.
                    </p>
                  )}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 self-start text-sm text-link underline-offset-4 hover:underline"
                    >
                      Abrir o documento original
                      <ArrowSquareOut aria-hidden="true" className="size-3.5" />
                      <span className="sr-only">(abre em outra aba)</span>
                    </a>
                  )}
                </div>
              </Disclosure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
