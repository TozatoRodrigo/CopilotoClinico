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
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  const where = [result.section, result.sourceVersion].filter(Boolean).join(' · ');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(citationText(result));
      toast.success('Trecho copiado com a fonte.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  // Bloco de resposta: tags de origem → título da fonte → seção/versão →
  // trecho como citação (quote do Notion) → ações discretas.
  return (
    <article className="flex flex-col gap-2.5 py-5 first:pt-1">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {citedInAnalysis && (
            <Badge variant="default">
              <SealCheck weight="fill" aria-hidden="true" />
              Usado nesta análise
            </Badge>
          )}
          <SourceOriginBadge origin={result.origin} />
        </div>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[0.9375rem] leading-snug font-semibold text-pretty text-foreground">
            {result.source}
          </h3>
          {where && <p className="text-[0.8125rem] text-muted-foreground">{where}</p>}
        </div>
      </header>

      <p
        className={cn(
          'max-w-[70ch] border-l-[3px] border-border pl-3.5 text-[0.9375rem] leading-relaxed whitespace-pre-line text-foreground',
          !expanded && isLong && 'line-clamp-5',
        )}
      >
        {body}
      </p>

      <footer className="-ml-2 flex flex-wrap items-center gap-1">
        {isLong && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground max-sm:h-10"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <CaretDown
              className={cn('transition-transform duration-150', expanded && 'rotate-180')}
              aria-hidden="true"
            />
            {expanded ? 'Mostrar menos' : 'Ler trecho completo'}
          </Button>
        )}
        {result.documentUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-link hover:text-link max-sm:h-10"
            asChild
          >
            <a href={result.documentUrl} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut aria-hidden="true" />
              Ver documento oficial
            </a>
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground max-sm:h-10"
          onClick={() => void handleCopy()}
        >
          <Copy aria-hidden="true" />
          Copiar com a fonte
        </Button>
      </footer>
    </article>
  );
}

function ResultsSkeleton() {
  return (
    <div
      className="flex flex-col divide-y divide-border"
      aria-busy="true"
      aria-label="Buscando diretrizes"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 py-5 first:pt-1">
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex flex-col gap-1.5 border-l-[3px] border-border pl-3.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
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
    return <ResultsSkeleton />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <WarningCircle aria-hidden="true" />
        <AlertTitle>Não foi possível buscar agora.</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          {/* Erro do servidor, não da rede do médico: não mandar checar a conexão. */}
          <span>A busca falhou do nosso lado. Tente de novo em instantes.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const results = data?.results ?? [];
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <MagnifyingGlass className="size-8 text-fg-tertiary" aria-hidden="true" />
        <div className="flex max-w-sm flex-col gap-1">
          <p className="text-[0.9375rem] font-medium text-foreground">
            Nenhuma diretriz próxima desta busca.
          </p>
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">
            Tente um termo mais específico — o nome do agravo, do medicamento ou do procedimento. Se
            você tem a referência para este cenário, envie para a curadoria.
          </p>
        </div>
        <SuggestGuidelineDialog />
      </div>
    );
  }

  // Os documentos que a análise citou vêm primeiro: é o que o médico quer
  // conferir antes de qualquer outra coisa.
  const ordered = [...results].sort(
    (a, b) => Number(cited.has(b.chunkId)) - Number(cited.has(a.chunkId)),
  );
  const citedCount = ordered.filter((result) => cited.has(result.chunkId)).length;

  return (
    <div
      className={cn('flex flex-col transition-opacity', isFetching && 'opacity-60')}
      aria-busy={isFetching || undefined}
    >
      <p className="pb-2 text-xs text-muted-foreground">
        {ordered.length} {ordered.length === 1 ? 'trecho encontrado' : 'trechos encontrados'}
        {citedCount > 0 ? ' · os usados na análise aparecem primeiro' : ' · por relevância'}
      </p>
      <div className="flex flex-col divide-y divide-border">
        {ordered.map((result) => (
          <ResultCard
            key={result.chunkId}
            result={result}
            citedInAnalysis={cited.has(result.chunkId)}
          />
        ))}
      </div>
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
  /** Texto que o médico descreveu — a busca padrão quando não há entendimento. */
  caseText: string | null | undefined;
  /**
   * Consultas de busca do entendimento do caso (ADR-013, Etapa 1): curtas, no
   * vocabulário das diretrizes ("manejo inicial AVC isquêmico trombólise").
   * Quando existem, são a busca padrão — acham o documento certo mesmo sem
   * busca por significado (sem embeddings desde 11/10/2026), o que o texto
   * livre do caso nem sempre consegue.
   */
  searchTopics?: string[];
  citedChunkIds?: string[];
  /** Fontes citadas na análise, oferecidas como atalho de busca. */
  citedSources?: string[];
}

function ConsultBody({
  caseText,
  searchTopics = [],
  citedChunkIds,
  citedSources = [],
}: ConsultBodyProps) {
  const [refineInput, setRefineInput] = useState('');
  const [refine, setRefine] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setRefine(refineInput), 350);
    return () => clearTimeout(timer);
  }, [refineInput]);

  const topics = searchTopics.map((topic) => topic.trim()).filter(Boolean);
  const baseQuery = topics.length > 0 ? topics.join('; ') : (caseText?.trim() ?? '');
  const query = refine.trim() || baseQuery;
  const searchingByCase = !refine.trim() && baseQuery.length > 0;
  const casePreview =
    baseQuery.length > CASE_PREVIEW_CHARS
      ? `${baseQuery.slice(0, CASE_PREVIEW_CHARS).trim()}…`
      : baseQuery;
  const shortcuts = [...new Set(citedSources)].slice(0, 4);

  return (
    <>
      <SheetHeader className="gap-3 border-b border-border px-5 pt-5 pb-4">
        <div className="flex flex-col gap-1 pr-8">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" />
            Consulta · sem sair do caso
          </p>
          <SheetTitle className="font-display text-xl">Diretrizes para este caso</SheetTitle>
          <SheetDescription className="hidden text-[0.8125rem] text-pretty sm:block">
            Base curada e protocolos oficiais do Ministério da Saúde. Os documentos usados na
            análise aparecem primeiro.
          </SheetDescription>
        </div>

        <div className="flex h-10 items-center gap-2 rounded-lg border border-input bg-surface-input px-3 transition-[border-color,box-shadow,background-color] duration-100 focus-within:border-ring focus-within:bg-background focus-within:ring-[3px] focus-within:ring-ring/25">
          <MagnifyingGlass className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={refineInput}
            onChange={(event) => setRefineInput(event.target.value)}
            placeholder={
              baseQuery
                ? 'Refinar: ex. soro, gravidade'
                : 'Busque um agravo, medicamento…'
            }
            aria-label="Refinar a busca nas diretrizes"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-tertiary md:text-sm"
          />
          {refineInput && (
            <button
              type="button"
              onClick={() => setRefineInput('')}
              aria-label="Limpar e voltar a buscar pelo caso"
              className="-mr-1.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {searchingByCase && topics.length === 0 && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            Buscando pelo caso: <span className="italic">“{casePreview}”</span>
          </p>
        )}

        {topics.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {searchingByCase && (
              <p className="text-xs text-muted-foreground">
                Buscando pelo que o Copiloto entendeu do caso:
              </p>
            )}
            <div className="flex flex-wrap gap-1.5" aria-label="Buscas do entendimento do caso">
              {topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setRefineInput(topic)}
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:h-9"
                >
                  <MagnifyingGlass className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{topic}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Fontes citadas na análise">
            {shortcuts.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setRefineInput(source.replace(/^[^—]*—\s*/, ''))}
                className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:h-9"
              >
                <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{source}</span>
              </button>
            ))}
          </div>
        )}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <GuidelineConsultResults query={query} citedChunkIds={citedChunkIds} />
      </div>

      <div className="border-t border-border px-5 py-3">
        <SheetClose asChild>
          <Button type="button" variant="outline" className="w-full">
            <ArrowUUpLeft aria-hidden="true" />
            Voltar ao caso
          </Button>
        </SheetClose>
      </div>
    </>
  );
}
