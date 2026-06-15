'use client';

import { useState, useMemo } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle,
  Clock,
  MagnifyingGlass,
  SealCheck,
  ShieldWarning,
  X,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-store';
import {
  useGuidelineSearch,
  useGuidelineSources,
  usePendingGuidelineChunks,
  useApproveGuidelineChunk,
  useRejectGuidelineChunk,
} from '@/lib/clinical-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { GuidelineSearchResult, PendingGuidelineChunk } from '@/lib/types';

const SPECIALTIES = [
  'Clínica Médica',
  'Cardiologia',
  'Pneumologia',
  'Infectologia',
  'Geriatria',
  'Emergência',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  });
}

function ProvenanceSeal({ reviewer, validFrom }: { reviewer: string | null; validFrom: string }) {
  if (!reviewer) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <Clock className="size-3" aria-hidden="true" />
        {formatDate(validFrom)}
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="gap-1 text-[10px]">
      <SealCheck className="size-3" weight="fill" aria-hidden="true" />
      Validado por {reviewer} · {formatDate(validFrom)}
    </Badge>
  );
}

function GuidelineCard({ result }: { result: GuidelineSearchResult }) {
  const meta = (result.metadata ?? {}) as Record<string, unknown>;
  const cenario = typeof meta.cenario === 'string' ? meta.cenario : null;
  const redFlags = Array.isArray(meta.redFlags) ? meta.redFlags : [];
  const origin = result.institutionId ? 'institutional' : 'public';

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold">{result.source}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                v{result.sourceVersion}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {result.specialty}
              </Badge>
              {result.evidenceLevel && (
                <Badge variant="outline" className="text-[10px]">
                  Evidência {result.evidenceLevel}
                </Badge>
              )}
              {origin === 'institutional' && (
                <Badge variant="success" className="text-[10px]">
                  Protocolo institucional
                </Badge>
              )}
            </div>
          </div>
          <ProvenanceSeal reviewer={result.reviewerName} validFrom={result.validFrom} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {cenario && (
          <p className="text-xs font-medium text-clinical-teal-deep">Cenário: {cenario}</p>
        )}
        <p className="line-clamp-4 text-sm text-muted-foreground">{result.text}</p>
        {redFlags.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-md bg-clinical-amber-bg px-3 py-2">
            <ShieldWarning
              className="mt-0.5 size-3.5 shrink-0 text-clinical-amber"
              aria-hidden="true"
            />
            <span className="text-xs text-clinical-amber-foreground">{redFlags.join(' · ')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SearchResults({ query, specialty }: { query: string; specialty: string | undefined }) {
  const { data, isLoading, isError } = useGuidelineSearch(query, specialty);

  if (query.trim().length < 2) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <BookOpen className="size-10 text-muted-foreground" weight="duotone" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Digite ao menos 2 caracteres para buscar no acervo clínico.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border/70 p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm text-destructive">Erro ao buscar diretrizes.</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <MagnifyingGlass className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Nenhum resultado para &ldquo;{query}&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {data.length} {data.length === 1 ? 'resultado' : 'resultados'}
      </p>
      {data.map((result) => (
        <GuidelineCard key={result.id} result={result} />
      ))}
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
      try {
        await approve.mutateAsync(id);
        ok++;
      } catch {
        /* keep going */
      }
    }
    setSelected(new Set());
    toast.success(`${ok} chunk${ok !== 1 ? 's' : ''} aprovado${ok !== 1 ? 's' : ''}`);
  };

  const handleReject = async (chunkId: string) => {
    try {
      await reject.mutateAsync({ chunkId, reason: 'Reprovado na revisão de curadoria' });
      toast.success('Chunk rejeitado.');
    } catch {
      toast.error('Erro ao rejeitar chunk.');
    }
  };

  const handleApprove = async (chunkId: string) => {
    try {
      await approve.mutateAsync(chunkId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(chunkId);
        return next;
      });
      toast.success('Chunk aprovado.');
    } catch {
      toast.error('Erro ao aprovar chunk.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const chunks = data ?? [];

  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle className="size-8 text-clinical-green" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Nenhum chunk aguardando revisão. Tudo em dia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {chunks.length} chunk{chunks.length !== 1 ? 's' : ''} aguardando revisão
        </p>
        {selected.size > 0 && (
          <Button
            size="sm"
            variant="default"
            onClick={() => void handleBatchApprove()}
            loading={approve.isPending}
            className="gap-1.5"
          >
            <Check className="size-3.5" aria-hidden="true" />
            Aprovar {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {chunks.map((chunk: PendingGuidelineChunk) => (
          <PendingChunkRow
            key={chunk.id}
            chunk={chunk}
            isSelected={selected.has(chunk.id)}
            onToggle={() => toggleSelect(chunk.id)}
            onApprove={() => void handleApprove(chunk.id)}
            onReject={() => void handleReject(chunk.id)}
            isApproving={approve.isPending}
            isRejecting={reject.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function PendingChunkRow({
  chunk,
  isSelected,
  onToggle,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  chunk: PendingGuidelineChunk;
  isSelected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isSelected ? 'border-clinical-teal/40 bg-clinical-teal-tint/30' : 'border-border/70',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={isSelected}
          aria-label="Selecionar chunk para aprovação em lote"
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isSelected
              ? 'border-clinical-teal bg-clinical-teal text-white'
              : 'border-border bg-card hover:border-clinical-teal/40',
          )}
        >
          {isSelected && <Check className="size-3" weight="bold" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">{chunk.source}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              v{chunk.sourceVersion}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {chunk.specialty}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{chunk.text}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onApprove}
            disabled={isApproving}
            aria-label="Aprovar chunk"
            className="text-clinical-green hover:bg-clinical-green-bg"
          >
            <Check className="size-4" aria-hidden="true" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onReject}
            disabled={isRejecting}
            aria-label="Rejeitar chunk"
            className="text-destructive hover:bg-destructive/10"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function GuidelinesPage() {
  const { role } = useAuth();
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'library' | 'curator'>('library');

  const isCurator = role === 'compliance' || role === 'admin';

  const specialtyChips = useMemo(() => ['all', ...SPECIALTIES], []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-xl tracking-tight">Biblioteca Clínica</h1>
        <p className="text-sm text-muted-foreground">
          Acervo de diretrizes validadas com busca textual e selo de procedência.
        </p>
      </div>

      {isCurator && (
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'library'}
            onClick={() => setTab('library')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === 'library'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Biblioteca
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'curator'}
            onClick={() => setTab('curator')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === 'curator'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Curadoria
          </button>
        </div>
      )}

      {tab === 'library' ? (
        <>
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar diretrizes (ex: gripe imunossuprimido, HAS emergência...)"
              className="pl-9"
              aria-label="Buscar na biblioteca clínica"
            />
          </div>

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filtrar por especialidade"
          >
            {specialtyChips.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpecialty(s === 'all' ? undefined : s)}
                aria-pressed={(s === 'all' && !specialty) || specialty === s}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  (s === 'all' && !specialty) || specialty === s
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {s === 'all' ? 'Todas' : s}
              </button>
            ))}
          </div>

          <SearchResults query={query} specialty={specialty} />
        </>
      ) : (
        <CuratorQueue />
      )}
    </div>
  );
}
