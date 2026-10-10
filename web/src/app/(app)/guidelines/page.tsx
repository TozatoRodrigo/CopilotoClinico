'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Buildings,
  CaretRight,
  Check,
  CheckCircle,
  Checks,
  MagnifyingGlass,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-store';
import {
  useGuidelineSearch,
  usePendingGuidelineChunks,
  useApproveGuidelineChunk,
  useRejectGuidelineChunk,
} from '@/lib/clinical-queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SuggestGuidelineDialog,
  specialtyLabel,
} from '@/components/domain/suggest-guideline-dialog';
import { GuidelineConsultResults } from '@/components/domain/guideline-consult';
import { SourceOriginBadge } from '@/components/domain/source-origin-badge';
import type { GuidelineSearchResult, PendingGuidelineChunk } from '@/lib/types';

const FILTER_PILLS = ['Todas', 'Trauma', 'Cardíaco', 'Pediátrico', 'Neuro', 'Geral'];

// S24-GUIDE-02 — os valores de `specialty` no banco são os slugs em
// snake_case usados na curadoria (ver front-matter de
// docs/guidelines/drafts/**/*.md e prisma/seeds/guidelines-seed.ts), nunca
// os rótulos em português com acento que apareciam aqui antes
// ('Cardiologia', 'Emergência'...). Como `gc.specialty = $N` no backend é
// comparação exata, o mapa antigo não batia com nenhum valor real — todo
// filtro além de "Todas" devolvia lista vazia, mesmo com diretrizes daquela
// especialidade aprovadas. "Pediátrico" continua sem resultado até existir
// conteúdo curado com specialty "pediatria" — isso é esperado, não é bug.
const SPECIALTY_MAP: Record<string, string | undefined> = {
  Todas: undefined,
  Trauma: 'cirurgia_trauma',
  Cardíaco: 'cardiologia',
  Pediátrico: 'pediatria',
  Neuro: 'neurologia',
  Geral: 'clinica_medica',
};

/**
 * Perguntas de partida, como o "Ask anything" do Notion: mostram o tipo de
 * pergunta que a base responde bem (agravo + contexto) e preenchem a busca.
 */
const EXAMPLE_QUESTIONS = [
  'Acidente escorpiônico em criança',
  'Dengue com sinais de alarme',
  'Sepse na primeira hora',
  'Anafilaxia',
];

/** Chip de filtro da barra de view (estilo das views de database do Notion). */
const chipClass =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:h-10';

function formatVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

// S24-GUIDE-02 — o card não tinha nenhum onClick; "Abrir →" era um <span>
// sem handler, só aparecia em protocolo institucional, e mesmo lá não
// levava a lugar nenhum. Clicar num card agora expande e mostra o texto
// completo da diretriz (já vem no payload da busca — sem requisição nova).
// No redesign, o card virou uma linha de database com toggle do Notion.
function LibraryRow({ result }: { result: GuidelineSearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const origin = result.institutionId ? 'institutional' : 'public';
  const snippet = result.text.length > 180 ? result.text.slice(0, 180).trim() + '…' : result.text;
  const dateStr = new Date(result.validFrom).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  });
  const details = [
    result.evidenceLevel ? `Evidência ${result.evidenceLevel}` : null,
    result.reviewerName ? `Revisado por ${result.reviewerName}` : null,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group grid w-full grid-cols-[0.75rem_minmax(0,1fr)] items-start gap-x-2.5 px-2 py-2.5 text-left transition-colors duration-75 hover:bg-hover/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none focus-visible:ring-inset md:grid-cols-[0.75rem_minmax(0,1fr)_9.5rem_12rem] md:gap-x-4"
      >
        <CaretRight
          weight="fill"
          aria-hidden="true"
          className="mt-[5px] size-3 text-muted-foreground transition-transform duration-150 group-aria-expanded:rotate-90"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{result.source}</span>
          <span className="block text-xs text-muted-foreground">
            {formatVersion(result.sourceVersion)} · vigente desde {dateStr}
          </span>
          {!expanded && (
            <span className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
              {snippet}
            </span>
          )}
          <span className="mt-2 flex flex-wrap gap-1.5 md:hidden">
            <Badge variant="gray">{specialtyLabel(result.specialty)}</Badge>
            <SourceOriginBadge origin={origin} />
          </span>
        </span>
        <span className="hidden pt-px md:block">
          <Badge variant="gray">{specialtyLabel(result.specialty)}</Badge>
        </span>
        <span className="hidden pt-px md:block">
          <SourceOriginBadge origin={origin} />
        </span>
      </button>
      {expanded && (
        <div className="pr-2 pb-4 pl-[2.125rem]">
          <p className="max-w-[68ch] border-l-[3px] border-border pl-3.5 text-[0.9375rem] leading-relaxed whitespace-pre-line text-foreground">
            {result.text}
          </p>
          {details.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">{details.join(' · ')}</p>
          )}
        </div>
      )}
    </li>
  );
}

function LibrarySkeleton() {
  return (
    <ul className="divide-y divide-border border-y border-border" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-2 py-3">
          <Skeleton className="mt-1 size-3" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <Skeleton className="hidden h-5 w-24 md:block" />
          <Skeleton className="hidden h-5 w-28 md:block" />
        </li>
      ))}
    </ul>
  );
}

function CuratorQueue() {
  const { data, isLoading } = usePendingGuidelineChunks();
  const approve = useApproveGuidelineChunk();
  const reject = useRejectGuidelineChunk();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    let ok = 0;
    for (const id of ids) {
      try {
        await approve.mutateAsync(id);
        ok++;
      } catch {
        /* keep going */
      }
    }
    setSelected(new Set());
    toast.success(`${ok} trecho${ok !== 1 ? 's' : ''} aprovado${ok !== 1 ? 's' : ''}`);
  };

  const handleApprove = async (chunkId: string) => {
    try {
      await approve.mutateAsync(chunkId);
      setSelected((p) => {
        const n = new Set(p);
        n.delete(chunkId);
        return n;
      });
      toast.success('Trecho aprovado.');
    } catch {
      toast.error('Erro ao aprovar trecho.');
    }
  };

  const handleReject = async (chunkId: string) => {
    try {
      await reject.mutateAsync({ chunkId, reason: 'Reprovado na revisão de curadoria' });
      toast.success('Trecho rejeitado.');
    } catch {
      toast.error('Erro ao rejeitar trecho.');
    }
  };

  if (isLoading) return <LibrarySkeleton />;

  const chunks = data ?? [];
  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border-y border-border py-12 text-center">
        <CheckCircle className="size-8 text-tone-green" weight="duotone" aria-hidden="true" />
        <p className="text-[0.9375rem] font-medium text-foreground">Tudo em dia</p>
        <p className="text-sm text-muted-foreground">Nenhum trecho aguardando revisão.</p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Aguardando revisão"
        count={chunks.length}
        description="Trechos sugeridos pelos médicos. Só entram na base — e passam a ser citados — depois de aprovados."
        action={
          selected.size > 0 ? (
            <Button
              size="sm"
              onClick={() => void handleBatchApprove()}
              loading={approve.isPending}
            >
              <Check weight="bold" /> Aprovar {selected.size} selecionado
              {selected.size !== 1 ? 's' : ''}
            </Button>
          ) : null
        }
      />
      <ul className="divide-y divide-border border-y border-border">
        {chunks.map((chunk: PendingGuidelineChunk) => {
          const isSelected = selected.has(chunk.id);
          return (
            <li
              key={chunk.id}
              className={cn(
                'flex items-start gap-3 px-2 py-3 transition-colors duration-75',
                isSelected ? 'bg-tone-blue-bg' : 'hover:bg-hover/60',
              )}
            >
              <button
                type="button"
                onClick={() => toggleSelect(chunk.id)}
                aria-pressed={isSelected}
                aria-label={`Selecionar trecho de ${chunk.source}`}
                className="-m-2.5 flex size-9 shrink-0 items-center justify-center rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-[3px] border transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-fg-tertiary bg-background',
                  )}
                >
                  {isSelected && <Check className="size-3" weight="bold" aria-hidden="true" />}
                </span>
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{chunk.source}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatVersion(chunk.sourceVersion)}
                  </span>
                  <Badge variant="gray">{specialtyLabel(chunk.specialty)}</Badge>
                </div>
                <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {chunk.text}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleApprove(chunk.id)}
                  disabled={approve.isPending}
                  aria-label={`Aprovar trecho de ${chunk.source}`}
                  className="text-tone-green hover:bg-tone-green-bg hover:text-tone-green"
                >
                  <Check weight="bold" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleReject(chunk.id)}
                  disabled={reject.isPending}
                  aria-label={`Rejeitar trecho de ${chunk.source}`}
                  className="text-destructive hover:bg-tone-red-bg hover:text-destructive"
                >
                  <X weight="bold" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function GuidelinesPage() {
  const { role } = useAuth();
  const searchParams = useSearchParams();
  // UX-02 — permite chegar aqui com a busca já preenchida a partir do
  // banner de incerteza da análise ("Buscar nas diretrizes"), sem exigir
  // que o médico redigite o que já estava descrito no caso.
  const [queryInput, setQueryInput] = useState(() => searchParams.get('q') ?? '');
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [activePill, setActivePill] = useState('Todas');
  // Filtro local: `institutionId` já vem em cada trecho da biblioteca.
  const [onlyInstitutional, setOnlyInstitutional] = useState(false);
  const [tab, setTab] = useState<'library' | 'curator'>('library');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  // "/" leva o foco para a busca (atalho do Notion/GitHub), exceto quando o
  // médico já está digitando em outro campo.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (!searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isCurator = role === 'compliance' || role === 'admin';
  const specialty = SPECIALTY_MAP[activePill];

  // S24-GUIDE-01 — sem query, isto lista tudo que está aprovado (modo
  // biblioteca); com query, filtra por relevância. limit=50 para que
  // "listar tudo" realmente mostre tudo, não só o recorte padrão de 20.
  const hasQuery = query.trim().length >= 2;
  // Sem termo: modo biblioteca (lista o que está aprovado). Com termo: a
  // mesma consulta do painel do caso — por significado e palavra-chave, nas
  // bases curada e oficial (GuidelineConsultResults).
  const { data, isLoading, isError, refetch } = useGuidelineSearch('', specialty, 50);
  // Aberta a partir de um caso (?encounter=<id>): oferecer a volta. O antigo
  // "Usar no caso atual" levava para o caso em revisão MAIS RECENTE, que
  // podia ser de outro paciente.
  const fromEncounterId = searchParams.get('encounter');

  const library = (data ?? []).filter((result) => !onlyInstitutional || result.institutionId);
  const hasResults = !isLoading && !isError && library.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Enter busca na hora, sem esperar o debounce.
    setQuery(queryInput);
  }

  const libraryView = (
    <div className="flex flex-col gap-8">
      {/* Busca como "Ask anything" do Notion: o bloco principal da página. */}
      <div className="flex flex-col gap-3">
        <form role="search" onSubmit={handleSubmit}>
          <div className="flex h-12 items-center gap-3 rounded-lg border border-input bg-background px-4 shadow-sm transition-[border-color,box-shadow] duration-100 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 md:h-14">
            <MagnifyingGlass
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Busque um agravo, dose ou conduta…"
              aria-label="Buscar na biblioteca clínica"
              aria-keyshortcuts="/"
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-tertiary md:text-[1.0625rem]"
            />
            {queryInput ? (
              <button
                type="button"
                onClick={() => {
                  setQueryInput('');
                  setQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="Limpar busca"
                className="-mr-1.5 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:size-10"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : (
              <Kbd className="max-md:hidden" aria-hidden="true">
                /
              </Kbd>
            )}
          </div>
        </form>

        {!hasQuery && (
          <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <span className="mr-0.5 shrink-0 text-[0.8125rem] text-muted-foreground">
              Experimente:
            </span>
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQueryInput(example);
                  setQuery(example);
                }}
                className={cn(
                  chipClass,
                  'border border-border text-muted-foreground hover:bg-hover hover:text-foreground',
                )}
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasQuery ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={<span className="line-clamp-2 break-words">Resultados para “{query.trim()}”</span>}
            description="Por significado e palavra-chave, na base curada e nos protocolos oficiais do Ministério da Saúde."
          />
          <GuidelineConsultResults query={query} />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Biblioteca"
            count={hasResults ? library.length : undefined}
            description="Trechos aprovados pela curadoria clínica. Abra uma linha para ler o texto completo."
          />

          {/* Barra de view: especialidade à esquerda, protocolos do hospital à direita. */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <div
              role="group"
              aria-label="Filtrar por especialidade"
              className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 max-sm:w-full"
            >
              {FILTER_PILLS.map((pill) => (
                <button
                  key={pill}
                  type="button"
                  onClick={() => setActivePill(pill)}
                  aria-pressed={activePill === pill}
                  className={cn(
                    chipClass,
                    activePill === pill
                      ? 'bg-active font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                  )}
                >
                  {pill}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOnlyInstitutional((v) => !v)}
              aria-pressed={onlyInstitutional}
              className={cn(
                chipClass,
                'border',
                onlyInstitutional
                  ? 'border-transparent bg-tone-blue-bg font-medium text-tone-blue-ink'
                  : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground',
              )}
            >
              <Buildings className="size-3.5" aria-hidden="true" />
              Só protocolos do hospital
            </button>
          </div>

          {isLoading ? (
            <LibrarySkeleton />
          ) : isError ? (
            <Alert variant="destructive">
              <WarningCircle aria-hidden="true" />
              <AlertTitle>Erro ao carregar a biblioteca.</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>Verifique a conexão e tente de novo.</span>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          ) : library.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-y border-border px-4 py-12 text-center">
              <BookOpen className="size-8 text-fg-tertiary" aria-hidden="true" />
              <div className="flex max-w-sm flex-col gap-1">
                <p className="text-[0.9375rem] font-medium text-foreground">
                  {onlyInstitutional
                    ? 'Nenhum protocolo do hospital nesta especialidade.'
                    : 'Nenhuma diretriz aprovada nesta especialidade.'}
                </p>
                <p className="text-[0.8125rem] text-pretty text-muted-foreground">
                  A busca acima também consulta os protocolos oficiais do Ministério da Saúde.
                  Tem a referência? Envie para a curadoria.
                </p>
              </div>
              <SuggestGuidelineDialog />
            </div>
          ) : (
            <div>
              <div
                aria-hidden="true"
                className="hidden h-9 grid-cols-[0.75rem_minmax(0,1fr)_9.5rem_12rem] items-center gap-x-4 border-t border-border px-2 text-sm text-muted-foreground md:grid"
              >
                <span />
                <span>Fonte</span>
                <span>Especialidade</span>
                <span>Origem</span>
              </div>
              <ul className="divide-y divide-border border-y border-border">
                {library.map((result) => (
                  <LibraryRow key={result.id} result={result} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );

  return (
    <Page width="default">
      {fromEncounterId && (
        <Button
          variant="ghost"
          size="sm"
          className="-mb-5 -ml-2.5 w-fit text-muted-foreground"
          asChild
        >
          <Link href={`/encounters/${fromEncounterId}/result`}>
            <ArrowLeft /> Voltar ao caso
          </Link>
        </Button>
      )}

      <PageHeader
        icon={BookOpen}
        iconTone="brown"
        title="Diretrizes"
        description="Pergunte à base clínica: protocolos e diretrizes do Ministério da Saúde (PCDT) e protocolos da sua instituição. Toda resposta mostra a fonte."
        actions={<SuggestGuidelineDialog triggerLabel="Sugerir diretriz" triggerSize="default" />}
      />

      {isCurator ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'library' | 'curator')}>
          <TabsList>
            <TabsTrigger value="library">
              <BookOpen aria-hidden="true" />
              Biblioteca
            </TabsTrigger>
            <TabsTrigger value="curator">
              <Checks aria-hidden="true" />
              Curadoria
            </TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="pt-5">
            {libraryView}
          </TabsContent>
          <TabsContent value="curator" className="pt-5">
            <CuratorQueue />
          </TabsContent>
        </Tabs>
      ) : (
        libraryView
      )}
    </Page>
  );
}
