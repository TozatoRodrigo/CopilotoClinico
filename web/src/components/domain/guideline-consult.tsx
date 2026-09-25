'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  ArrowUUpLeft,
  BookOpen,
  CaretDown,
  Copy,
  MagnifyingGlass,
  SealCheck,
  X,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SourceOriginBadge } from '@/components/domain/source-origin-badge';
import { SuggestGuidelineDialog } from '@/components/domain/suggest-guideline-dialog';
import { useGuidelineConsult } from '@/lib/clinical-queries';
import { cn } from '@/lib/utils';
import type { GuidelineConsultResult } from '@/lib/types';

/**
 * Consulta de diretrizes DENTRO do caso.
 *
 * Origem: médico do piloto (25/09/2026), criança picada por escorpião. O botão
 * "Buscar nas diretrizes" levava para outra tela buscando pelo raciocínio do
 * modelo, não achava nada e o médico perdia o caso, sem caminho de volta.
 *
 * Agora: painel lateral sobre o resultado (fechar = voltar exatamente onde
 * estava), buscando pelo caso que o médico descreveu, nas bases curada e
 * oficial, com os documentos usados na análise marcados.
 */

/** O cabeçalho "[PCDT · Título · Seção]" já aparece no card; não repetir no texto. */
function stripContextHeader(text: string): string {
  return text.replace(/^\[[^\]\n]*\]\n/, '').trim();
}

function citationText(result: GuidelineConsultResult): string {
  const where = [result.source, result.sourceVersion, result.section].filter(Boolean).join(' · ');
  return `${stripContextHeader(result.text)}\n\nFonte: ${where}${
    result.documentUrl ? `\n${result.documentUrl}` : ''
  }`;
}

function ResultCard({
  result,
  citedInAnalysis,
}: {
  result: GuidelineConsultResult;
  citedInAnalysis: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = stripContextHeader(result.text);
  const isLong = body.length > 360;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(citationText(result));
      toast.success('Trecho copiado com a fonte.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <article
      className={cn(
        'rounded-[14px] border bg-card p-4',
        citedInAnalysis ? 'border-clinical-teal/35' : 'border-clinical-line',
      )}
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {citedInAnalysis && (
            <span className="inline-flex items-center gap-1 rounded-md bg-clinical-teal-tint px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide text-clinical-teal-deep">
              <SealCheck className="size-3" weight="fill" />
              Usado nesta análise
            </span>
          )}
          <SourceOriginBadge origin={result.origin} />
        </div>
        <h3 className="text-[0.9375rem] font-semibold leading-snug text-clinical-ink">
          {result.source}
        </h3>
        <p className="font-mono text-[0.6875rem] text-muted-foreground">
          {[result.section, result.sourceVersion].filter(Boolean).join(' · ')}
        </p>
      </header>

      <p
        className={cn(
          'mt-3 whitespace-pre-line text-[0.84375rem] leading-relaxed text-clinical-ink-soft',
          !expanded && isLong && 'line-clamp-5',
        )}
      >
        {body}
      </p>

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {isLong && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2 text-[0.8rem]"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <CaretDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Mostrar menos' : 'Ler trecho completo'}
          </Button>
        )}
        {result.documentUrl && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[0.8rem]"
            asChild
          >
            <a href={result.documentUrl} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut className="size-3.5" />
              Ver documento oficial
            </a>
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-[0.8rem]"
          onClick={() => void handleCopy()}
        >
          <Copy className="size-3.5" />
          Copiar com a fonte
        </Button>
      </footer>
    </article>
  );
}

/**
 * Lista de resultados da consulta. Reaproveitada pelo painel do caso e pela
 * tela de Diretrizes, para as duas buscarem igual.
 */
export function GuidelineConsultResults({
  query,
  citedChunkIds = [],
}: {
  query: string;
  citedChunkIds?: string[];
}) {
  const { data, isLoading, isFetching, isError, refetch } = useGuidelineConsult(query);
  const cited = useMemo(() => new Set(citedChunkIds), [citedChunkIds]);

  if (query.trim().length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Digite um termo para buscar nas diretrizes.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Buscando diretrizes">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-[14px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-destructive">Não foi possível buscar agora.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const results = data?.results ?? [];
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <MagnifyingGlass className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium text-clinical-ink">
          Nenhuma diretriz próxima desta busca.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Tente um termo mais específico — o nome do agravo, do medicamento ou do procedimento. Se
          você tem a referência para este cenário, envie para a curadoria.
        </p>
        <SuggestGuidelineDialog />
      </div>
    );
  }

  // Os documentos que a análise citou vêm primeiro: é o que o médico quer
  // conferir antes de qualquer outra coisa.
  const ordered = [...results].sort(
    (a, b) => Number(cited.has(b.chunkId)) - Number(cited.has(a.chunkId)),
  );

  return (
    <div className={cn('flex flex-col gap-3 transition-opacity', isFetching && 'opacity-60')}>
      {ordered.map((result) => (
        <ResultCard
          key={result.chunkId}
          result={result}
          citedInAnalysis={cited.has(result.chunkId)}
        />
      ))}
    </div>
  );
}

const CASE_PREVIEW_CHARS = 140;

/**
 * Painel lateral de consulta (tela cheia no celular). Abre buscando pelo caso;
 * digitar refina; limpar volta a buscar pelo caso.
 */
export function GuidelineConsultSheet({
  open,
  onOpenChange,
  ...bodyProps
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & ConsultBodyProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {/* O conteúdo desmonta ao fechar: reabrir volta a buscar pelo caso. */}
        <ConsultBody {...bodyProps} />
      </SheetContent>
    </Sheet>
  );
}

interface ConsultBodyProps {
  /** Texto que o médico descreveu — a busca padrão. */
  caseText: string | null | undefined;
  citedChunkIds?: string[];
  /** Fontes citadas na análise, oferecidas como atalho de busca. */
  citedSources?: string[];
}

function ConsultBody({ caseText, citedChunkIds, citedSources = [] }: ConsultBodyProps) {
  const [refineInput, setRefineInput] = useState('');
  const [refine, setRefine] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setRefine(refineInput), 350);
    return () => clearTimeout(timer);
  }, [refineInput]);

  const baseQuery = caseText?.trim() ?? '';
  const query = refine.trim() || baseQuery;
  const searchingByCase = !refine.trim() && baseQuery.length > 0;
  const casePreview =
    baseQuery.length > CASE_PREVIEW_CHARS
      ? `${baseQuery.slice(0, CASE_PREVIEW_CHARS).trim()}…`
      : baseQuery;
  const shortcuts = [...new Set(citedSources)].slice(0, 4);

  return (
    <>
      <SheetHeader className="border-b border-clinical-line px-5 pb-4 pt-5">
        <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
          <BookOpen className="size-3.5" weight="duotone" />
          Consulta · sem sair do caso
        </p>
        <SheetTitle className="font-display text-[1.5rem] font-normal leading-tight">
          Diretrizes para este caso
        </SheetTitle>
        <SheetDescription className="hidden text-[0.8125rem] sm:block">
          Base curada e protocolos oficiais do Ministério da Saúde. Os documentos usados na análise
          aparecem primeiro.
        </SheetDescription>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-clinical-teal/60 bg-card px-3 focus-within:shadow-[0_0_0_3px_rgba(14,124,123,0.12)]">
          <MagnifyingGlass className="size-4 shrink-0 text-clinical-teal" />
          <input
            value={refineInput}
            onChange={(event) => setRefineInput(event.target.value)}
            placeholder={
              baseQuery
                ? 'Refinar: ex. soro, gravidade'
                : 'Busque um agravo, medicamento…'
            }
            aria-label="Refinar a busca nas diretrizes"
            className="h-11 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
          />
          {refineInput && (
            <button
              type="button"
              onClick={() => setRefineInput('')}
              aria-label="Limpar e voltar a buscar pelo caso"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {searchingByCase && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            Buscando pelo caso: <span className="italic">“{casePreview}”</span>
          </p>
        )}

        {shortcuts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Fontes citadas na análise">
            {shortcuts.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setRefineInput(source.replace(/^[^—]*—\s*/, ''))}
                className="rounded-full border border-clinical-line bg-card px-3 py-1 text-[0.75rem] text-muted-foreground transition-colors hover:border-clinical-teal/40 hover:text-clinical-ink"
              >
                {source}
              </button>
            ))}
          </div>
        )}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <GuidelineConsultResults query={query} citedChunkIds={citedChunkIds} />
      </div>

      <div className="border-t border-clinical-line px-5 py-3">
        <SheetClose asChild>
          <Button type="button" variant="outline" className="w-full gap-1.5">
            <ArrowUUpLeft className="size-4" />
            Voltar ao caso
          </Button>
        </SheetClose>
      </div>
    </>
  );
}
