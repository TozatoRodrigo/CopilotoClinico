'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  MagnifyingGlass,
  SealCheck,
  ShieldWarning,
  Sparkle,
  Copy,
  PlusCircle,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-store';
import {
  useGuidelineSearch,
  usePendingGuidelineChunks,
  useApproveGuidelineChunk,
  useRejectGuidelineChunk,
  useEncounterList,
} from '@/lib/clinical-queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SuggestGuidelineDialog } from '@/components/domain/suggest-guideline-dialog';
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

function composeAnswer(results: GuidelineSearchResult[]): { text: string; count: number } {
  const top = results.slice(0, 5);
  if (top.length === 0) return { text: '', count: 0 };

  const excerpts = top.map((r, i) => {
    const snippet = r.text.length > 200 ? r.text.slice(0, 200).trim() + '…' : r.text;
    return { num: i + 1, snippet };
  });

  const text = excerpts
    .map((e) => `${e.snippet} [${e.num}]`)
    .join(' ');

  return { text, count: top.length };
}

function DirectAnswerCard({
  results,
  targetEncounterId,
}: {
  results: GuidelineSearchResult[];
  targetEncounterId?: string;
}) {
  const { text, count } = composeAnswer(results);

  function handleCopy() {
    const full = `${text}\n\n${results
      .slice(0, count)
      .map((r, i) => `[${i + 1}] ${r.source} v${r.sourceVersion}`)
      .join('\n')}`;
    navigator.clipboard.writeText(full);
    toast.success('Resposta copiada com citações.');
  }

  return (
    <div className="rounded-[14px] border border-clinical-teal/25 bg-clinical-teal-tint/40 p-5">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-clinical-teal-deep">
        <Sparkle className="size-3" weight="fill" />
        Resposta direta · {count} trechos
      </p>
      <p className="text-[0.95rem] leading-relaxed">{text}</p>
      <div className="mt-3.5 flex items-center gap-2 border-t border-clinical-line pt-3">
        <Button variant="outline" size="sm" className="h-[34px] gap-1.5 text-[0.8rem]" onClick={handleCopy}>
          <Copy className="size-3" /> Copiar com citações
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-[34px] gap-1.5 text-[0.8rem]"
          disabled={!targetEncounterId}
          title={targetEncounterId ? undefined : 'Nenhum caso em revisão no momento'}
          asChild={Boolean(targetEncounterId)}
        >
          {targetEncounterId ? (
            <Link href={`/encounters/${targetEncounterId}/result`}>
              <PlusCircle className="size-3" /> Usar no caso atual
            </Link>
          ) : (
            <>
              <PlusCircle className="size-3" /> Usar no caso atual
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// S24-GUIDE-02 — o card não tinha nenhum onClick; "Abrir →" era um <span>
// sem handler, só aparecia em protocolo institucional, e mesmo lá não
// levava a lugar nenhum. Clicar num card agora expande e mostra o texto
// completo da diretriz (já vem no payload da busca — sem requisição nova).
function SourceCard({ result, num }: { result: GuidelineSearchResult; num: number }) {
  const [expanded, setExpanded] = useState(false);
  const origin = result.institutionId ? 'institutional' : 'public';
  const snippet = result.text.length > 180 ? result.text.slice(0, 180).trim() + '…' : result.text;
  const dateStr = new Date(result.validFrom).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="rounded-[14px] border border-clinical-line bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3.5 p-4 text-left"
      >
        <span className="shrink-0 font-mono text-[0.75rem] text-clinical-teal-deep">[{num}]</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.85rem] font-semibold">
            {result.source}{' '}
            <span className="font-mono text-[0.7rem] font-normal text-muted-foreground">
              v{result.sourceVersion} · {dateStr}
            </span>
          </p>
          {!expanded && (
            <p className="mt-0.5 line-clamp-2 text-[0.8rem] leading-relaxed text-muted-foreground">
              "{snippet}"
            </p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide',
            origin === 'institutional'
              ? 'bg-clinical-teal-tint text-clinical-teal-deep'
              : 'border border-clinical-line text-muted-foreground',
          )}
        >
          {origin === 'institutional' ? 'Protocolo inst.' : 'Diretriz pública'}
        </span>
        <CaretDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded && (
        <div className="border-t border-clinical-line px-4 pb-4 pt-3">
          <p className="whitespace-pre-line text-[0.85rem] leading-relaxed">{result.text}</p>
          <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
            {result.specialty}
            {result.evidenceLevel ? ` · evidência ${result.evidenceLevel}` : ''}
            {result.reviewerName ? ` · revisado por ${result.reviewerName}` : ''}
          </p>
        </div>
      )}
    </div>
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
      try { await approve.mutateAsync(id); ok++; } catch { /* keep going */ }
    }
    setSelected(new Set());
    toast.success(`${ok} chunk${ok !== 1 ? 's' : ''} aprovado${ok !== 1 ? 's' : ''}`);
  };

  const handleApprove = async (chunkId: string) => {
    try { await approve.mutateAsync(chunkId); setSelected((p) => { const n = new Set(p); n.delete(chunkId); return n; }); toast.success('Chunk aprovado.'); }
    catch { toast.error('Erro ao aprovar chunk.'); }
  };

  const handleReject = async (chunkId: string) => {
    try { await reject.mutateAsync({ chunkId, reason: 'Reprovado na revisão de curadoria' }); toast.success('Chunk rejeitado.'); }
    catch { toast.error('Erro ao rejeitar chunk.'); }
  };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  const chunks = data ?? [];
  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle className="size-8 text-clinical-green" />
        <p className="text-sm text-muted-foreground">Nenhum chunk aguardando revisão. Tudo em dia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{chunks.length} chunk{chunks.length !== 1 ? 's' : ''} aguardando revisão</p>
        {selected.size > 0 && (
          <Button size="sm" onClick={() => void handleBatchApprove()} loading={approve.isPending} className="gap-1.5">
            <Check className="size-3.5" /> Aprovar {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {chunks.map((chunk: PendingGuidelineChunk) => (
          <div key={chunk.id} className={cn('rounded-lg border p-3', selected.has(chunk.id) ? 'border-clinical-teal/40 bg-clinical-teal-tint/30' : 'border-border/70')}>
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => toggleSelect(chunk.id)} aria-pressed={selected.has(chunk.id)}
                className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border', selected.has(chunk.id) ? 'border-clinical-teal bg-clinical-teal text-white' : 'border-border bg-card hover:border-clinical-teal/40')}>
                {selected.has(chunk.id) && <Check className="size-3" weight="bold" />}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">{chunk.source}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">v{chunk.sourceVersion}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{chunk.specialty}</Badge>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{chunk.text}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => handleApprove(chunk.id)} disabled={approve.isPending} className="text-clinical-green hover:bg-clinical-green-bg"><Check className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => handleReject(chunk.id)} disabled={reject.isPending} className="text-destructive hover:bg-destructive/10"><X className="size-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
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
  const [tab, setTab] = useState<'library' | 'curator'>('library');

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const isCurator = role === 'compliance' || role === 'admin';
  const specialty = SPECIALTY_MAP[activePill];

  // S24-GUIDE-01 — sem query, isto lista tudo que está aprovado (modo
  // biblioteca); com query, filtra por relevância. limit=50 para que
  // "listar tudo" realmente mostre tudo, não só o recorte padrão de 20.
  const hasQuery = query.trim().length >= 2;
  const { data, isLoading, isError } = useGuidelineSearch(query, specialty, 50);
  // UX — "Usar no caso atual": leva o trecho encontrado direto para a
  // análise do caso mais recente em revisão do médico, em vez de deixar o
  // botão sem destino.
  const activeCaseQuery = useEncounterList({ status: 'in_review', limit: 1 });
  const targetEncounterId = activeCaseQuery.data?.data[0]?.id;

  const hasResults = !isLoading && !isError && data && data.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div>
        <p className="mb-1 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground">
          Base clínica{hasResults ? ` · ${data!.length} diretrizes encontradas` : ''}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[2rem] font-normal leading-tight">
            Pergunte à diretriz
          </h1>
          <SuggestGuidelineDialog triggerVariant="ghost" />
        </div>
      </div>

      {isCurator && (
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}
            className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab === 'library' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            Biblioteca
          </button>
          <button type="button" role="tab" aria-selected={tab === 'curator'} onClick={() => setTab('curator')}
            className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab === 'curator' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            Curadoria
          </button>
        </div>
      )}

      {tab === 'library' ? (
        <>
          {/* Search bar */}
          <div className="flex items-center gap-3 rounded-2xl border border-clinical-teal bg-card px-5 py-0 shadow-[0_0_0_3px_rgba(14,124,123,0.1)]" style={{ height: 60 }}>
            <MagnifyingGlass className="size-[19px] shrink-0 text-clinical-teal" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Busque diretrizes, protocolos, evidência clínica..."
              aria-label="Buscar na biblioteca clínica"
              className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <Button size="sm" className="h-[38px] gap-1.5">
              <Sparkle className="size-3.5" weight="bold" /> Buscar
            </Button>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_PILLS.map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => setActivePill(pill)}
                aria-pressed={activePill === pill}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors',
                  activePill === pill
                    ? 'bg-clinical-teal-tint text-clinical-teal-deep font-semibold'
                    : 'border border-clinical-line bg-card text-muted-foreground hover:border-clinical-teal/40',
                )}
              >
                {pill}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setActivePill('Todas')}
              className="rounded-full border border-clinical-line bg-card px-3.5 py-1.5 text-[0.8rem] font-medium text-muted-foreground"
            >
              Só protocolos do hospital
            </button>
          </div>

          {/* Results — S24-GUIDE-01: sem query mostra a biblioteca inteira
              (aprovadas), com query filtra por relevância. Nunca fica vazia
              só por falta de termo digitado. */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-[14px]" />)}
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">Erro ao buscar diretrizes.</p>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MagnifyingGlass className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {hasQuery ? `Nenhum resultado para "${query}".` : 'Nenhuma diretriz aprovada ainda.'}
              </p>
              {/* F4 — o momento exato em que o médico descobre um buraco na
                  base é o momento certo para oferecer o caminho de contribuir.
                  Antes daqui, ele só tinha o console de curadoria, que exige
                  papel de curador e front-matter. */}
              <p className="max-w-sm text-xs text-muted-foreground">
                Se você tem a referência para este cenário, envie para a curadoria — é assim que a
                base deixa de ter esse buraco.
              </p>
              <SuggestGuidelineDialog defaultSource={hasQuery ? '' : undefined} />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Direct answer — só faz sentido como resposta a uma busca real */}
              {hasQuery && <DirectAnswerCard results={data} targetEncounterId={targetEncounterId} />}

              {/* Source cards */}
              <div className="flex flex-col gap-2.5">
                {data.slice(0, hasQuery ? 5 : data.length).map((result, i) => (
                  <SourceCard key={result.id} result={result} num={i + 1} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <CuratorQueue />
      )}
    </div>
  );
}
