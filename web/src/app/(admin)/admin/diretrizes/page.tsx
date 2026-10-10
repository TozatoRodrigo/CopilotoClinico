'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Database,
  FileText,
  UploadSimple,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { apiClient, ApiError } from '@/lib/api-client';
import { useGuidelineSources, usePendingGuidelineChunks } from '@/lib/clinical-queries';
import { parseGuidelineContent, type ParsedGuidelineFile, type ParseError } from '@/lib/front-matter';
import type { GuidelineSourceSummary, PendingGuidelineChunk } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Disclosure } from '@/components/ui/disclosure';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { formatDate, isReviewOverdue, REVIEW_CYCLE_MONTHS } from '../_lib/format';
import { specialtyLabel } from '@/components/domain/suggest-guideline-dialog';

interface UploadItem {
  filename: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  status: 'queued' | 'uploading' | 'success' | 'error';
  error?: string;
  action?: string;
}

interface StoredFile {
  parsed: ParsedGuidelineFile;
  item: UploadItem;
}

/** Estado do arquivo na fila de ingestão — sempre ícone + texto, nunca só cor. */
const UPLOAD_STATUS: Record<
  UploadItem['status'],
  { label: string; variant: 'secondary' | 'default' | 'success' | 'destructive' }
> = {
  queued: { label: 'Na fila', variant: 'secondary' },
  uploading: { label: 'Ingerindo', variant: 'default' },
  success: { label: 'Ingerido', variant: 'success' },
  error: { label: 'Erro', variant: 'destructive' },
};

function UploadStatusTag({ status }: { status: UploadItem['status'] }) {
  const tag = UPLOAD_STATUS[status];
  return (
    <Badge variant={tag.variant}>
      {status === 'queued' && <Clock aria-hidden="true" />}
      {status === 'uploading' && <ArrowClockwise className="animate-spin" aria-hidden="true" />}
      {status === 'success' && <CheckCircle weight="fill" aria-hidden="true" />}
      {status === 'error' && <XCircle weight="fill" aria-hidden="true" />}
      {tag.label}
    </Badge>
  );
}

/**
 * Etapa da esteira do pipeline (KB-002). `done` = etapa com conteúdo
 * publicado; `pending` = etapa que pede ação da curadoria (laranja).
 */
function PipelineStep({
  index,
  label,
  count,
  state,
  hint,
}: {
  index: number;
  label: string;
  /** `null` = contagem indisponível (erro ao carregar). */
  count: number | null;
  state: 'idle' | 'done' | 'pending';
  hint: string;
}) {
  return (
    <li className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {state === 'done' ? (
          <Check className="size-3.5 text-tone-green" weight="bold" aria-hidden="true" />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-full border border-current text-[0.625rem] font-semibold tabular-nums"
          >
            {index}
          </span>
        )}
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xl leading-none font-semibold text-foreground tabular-nums">{count ?? '—'}</span>
        {state === 'pending' && <Badge variant="warning">aguardando curadoria</Badge>}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </li>
  );
}

function PendingChunkRow({ chunk }: { chunk: PendingGuidelineChunk }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(action);
    try {
      if (action === 'approve') {
        await apiClient.post(`/guidelines/chunks/${chunk.id}/approve`);
        toast.success('Chunk aprovado.');
      } else {
        await apiClient.post(`/guidelines/chunks/${chunk.id}/reject`, {
          reason: 'Reprovado na revisão de curadoria',
        });
        toast.success('Chunk rejeitado.');
      }
      await queryClient.invalidateQueries({ queryKey: ['guideline-pending'] });
      await queryClient.invalidateQueries({ queryKey: ['guideline-sources'] });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao processar chunk.';
      toast.error(msg);
    } finally {
      setLoading(null);
    }
  }

  const titleId = `chunk-${chunk.id}-source`;
  const excerpt = chunk.text.length > 200 ? `${chunk.text.substring(0, 200)}...` : chunk.text;

  return (
    <li className="flex flex-col gap-3 px-2 py-3 sm:flex-row sm:items-start sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span id={titleId} className="mr-0.5 text-sm font-medium text-foreground">
            {chunk.source}
          </span>
          <Badge variant="gray">v{chunk.sourceVersion}</Badge>
          <Badge variant="brown">{specialtyLabel(chunk.specialty)}</Badge>
          {chunk.evidenceLevel && <Badge variant="purple">Evidência {chunk.evidenceLevel}</Badge>}
          <Badge variant="warning">
            <Clock weight="bold" aria-hidden="true" />
            Em revisão
          </Badge>
        </div>
        <p className="line-clamp-2 text-[0.8125rem] text-muted-foreground">{excerpt}</p>
        {chunk.text.length > 200 && (
          <Disclosure
            className="w-fit max-w-full"
            contentClassName="max-w-2xl"
            title={
              <span className="text-[0.8125rem]">
                Ler trecho completo{' '}
                <span className="font-normal text-muted-foreground">
                  · {chunk.text.length.toLocaleString('pt-BR')} caracteres
                </span>
              </span>
            }
          >
            <p className="border-l-2 border-border pl-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">
              {chunk.text}
            </p>
          </Disclosure>
        )}
        <p className="text-xs text-muted-foreground">Ingerido em {formatDate(chunk.createdAt)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          className="max-sm:h-10 max-sm:flex-1"
          aria-describedby={titleId}
          loading={loading === 'approve'}
          disabled={loading !== null}
          onClick={() => void handleAction('approve')}
        >
          <Check weight="bold" aria-hidden="true" />
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="max-sm:h-10 max-sm:flex-1"
          aria-describedby={titleId}
          loading={loading === 'reject'}
          disabled={loading !== null}
          onClick={() => void handleAction('reject')}
        >
          <X weight="bold" aria-hidden="true" />
          Rejeitar
        </Button>
      </div>
    </li>
  );
}

const SOURCE_COLUMNS: DataTableColumn<GuidelineSourceSummary>[] = [
  {
    key: 'source',
    header: 'Fonte',
    cardLabel: null,
    className: 'min-w-[16rem]',
    // Sem rótulo no card mobile: o nome é o título da linha (alinhado à esquerda).
    cell: (source) => <span className="block text-left font-medium text-foreground">{source.source}</span>,
  },
  {
    key: 'version',
    header: 'Versão',
    cell: (source) => <span className="tabular-nums">v{source.sourceVersion}</span>,
  },
  {
    key: 'chunks',
    header: 'Chunks',
    className: 'text-right tabular-nums',
    cell: (source) => source.chunkCount,
  },
  {
    key: 'since',
    header: 'Vigente desde',
    className: 'tabular-nums text-muted-foreground',
    cell: (source) => formatDate(source.validFrom),
  },
  {
    key: 'review',
    header: 'Revisão',
    cell: (source) =>
      source.active && isReviewOverdue(source.validFrom) ? (
        <Badge variant="warning">
          <Warning weight="fill" aria-hidden="true" />
          Revisão vencida
        </Badge>
      ) : (
        <span className="text-[0.8125rem] text-muted-foreground">{source.active ? 'Em dia' : '—'}</span>
      ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (source) =>
      source.active ? (
        <Badge variant="success">
          <CheckCircle weight="fill" aria-hidden="true" />
          Ativo
        </Badge>
      ) : (
        <Badge variant="secondary">Inativo</Badge>
      ),
  },
];

function SectionError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <ArrowClockwise aria-hidden="true" />
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function GuidelinesConsolePage() {
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const sourcesQuery = useGuidelineSources();
  const pendingQuery = usePendingGuidelineChunks();

  const sources: GuidelineSourceSummary[] = sourcesQuery.data ?? [];
  const pendingChunks: PendingGuidelineChunk[] = pendingQuery.data ?? [];

  const activeSources = sources.filter((s) => s.active);
  const overdueCount = activeSources.filter((s) => isReviewOverdue(s.validFrom)).length;

  const uploadItems = storedFiles.map((f) => f.item);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) => f.name.endsWith('.md') || f.name.endsWith('.txt'),
    );

    if (fileArray.length === 0) {
      toast.error('Apenas arquivos .md ou .txt são aceitos.');
      return;
    }

    const valid: StoredFile[] = [];
    const errors: ParseError[] = [];

    for (const file of fileArray) {
      const text = await file.text();
      try {
        const parsed = parseGuidelineContent(file.name, text);
        valid.push({
          parsed,
          item: {
            filename: file.name,
            source: parsed.meta.source,
            sourceVersion: parsed.meta.sourceVersion,
            specialty: parsed.meta.specialty,
            evidenceLevel: parsed.meta.evidenceLevel,
            status: 'queued',
          },
        });
      } catch (err) {
        errors.push({
          filename: file.name,
          error: err instanceof Error ? err.message : 'Erro ao processar arquivo',
          action: 'Edite o front-matter e reenvie.',
        });
      }
    }

    setParseErrors(errors);
    setStoredFiles(valid);

    if (valid.length > 0 && errors.length === 0) {
      toast.success(`${valid.length} arquivo(s) validado(s). Pronto para ingestão.`);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    const updated = [...storedFiles];

    for (let i = 0; i < updated.length; i++) {
      const stored = updated[i]!;
      updated[i] = { ...stored, item: { ...stored.item, status: 'uploading' } };
      setStoredFiles([...updated]);

      try {
        await apiClient.post('/guidelines/ingest-review', {
          text: stored.parsed.body,
          source: stored.parsed.meta.source,
          sourceVersion: stored.parsed.meta.sourceVersion,
          specialty: stored.parsed.meta.specialty,
          evidenceLevel: stored.parsed.meta.evidenceLevel,
          cenario: stored.parsed.meta.cenario,
          redFlags: stored.parsed.meta.redFlags,
        });

        updated[i] = { ...stored, item: { ...stored.item, status: 'success' } };
        setStoredFiles([...updated]);
      } catch (err) {
        const errorMsg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Erro na ingestão';
        updated[i] = {
          ...stored,
          item: {
            ...stored.item,
            status: 'error',
            error: errorMsg,
            action: 'Verifique o formato do arquivo e o front-matter, depois tente novamente.',
          },
        };
        setStoredFiles([...updated]);
      }
    }

    setUploading(false);
    const successCount = updated.filter((u) => u.item.status === 'success').length;
    if (successCount > 0) {
      toast.success(
        `${successCount} arquivo(s) ingerido(s). Os chunks estão agora em revisão.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['guideline-pending'] });
      await queryClient.invalidateQueries({ queryKey: ['guideline-sources'] });
    }
  }, [storedFiles, queryClient]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      void handleFiles(files);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files);
    }
  }

  const pipelineLoading = sourcesQuery.isPending || pendingQuery.isPending;

  return (
    <Page width="wide">
      <PageHeader
        icon={Database}
        title="Diretrizes"
        description="Console de ingestão do pipeline KB-002 — upload, curadoria e catálogo de fontes."
      />

      {/* Esteira do pipeline */}
      <section className="flex flex-col gap-3" aria-labelledby="pipeline-title">
        <SectionHeader title={<span id="pipeline-title">Esteira do pipeline</span>} />
        {pipelineLoading ? (
          <Skeleton className="h-[104px] w-full rounded-lg" />
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card sm:flex-row sm:divide-y-0">
            <PipelineStep
              index={1}
              label="Fontes ativas"
              count={sourcesQuery.error ? null : activeSources.length}
              state={activeSources.length > 0 ? 'done' : 'idle'}
              hint="Diretrizes com versão vigente"
            />
            <li aria-hidden="true" className="hidden items-center text-fg-tertiary sm:flex">
              <ArrowRight className="size-4" />
            </li>
            <PipelineStep
              index={2}
              label="Em revisão"
              count={pendingQuery.error ? null : pendingChunks.length}
              state={pendingChunks.length > 0 ? 'pending' : 'idle'}
              hint="Trechos ingeridos esperando aprovação"
            />
            <li aria-hidden="true" className="hidden items-center text-fg-tertiary sm:flex">
              <ArrowRight className="size-4" />
            </li>
            <PipelineStep
              index={3}
              label="Publicadas"
              count={sourcesQuery.error ? null : activeSources.length}
              state={activeSources.length > 0 ? 'done' : 'idle'}
              hint="Consultadas pelo Copiloto nas análises"
            />
          </ol>
        )}
        {overdueCount > 0 && (
          <Callout tone="orange" icon={<Warning weight="fill" />}>
            {overdueCount} fonte(s) com revisão vencida (&gt; {REVIEW_CYCLE_MONTHS} meses). Atualize ou reeingere.
          </Callout>
        )}
      </section>

      {/* Upload em lote */}
      <section className="flex flex-col gap-3" aria-labelledby="upload-title">
        <SectionHeader
          title={<span id="upload-title">Upload em lote</span>}
          description="Os arquivos são validados aqui e os trechos entram na fila de revisão abaixo."
        />
        <label
          htmlFor="guideline-files"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'group flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center transition-colors has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/40',
            dragOver
              ? 'border-primary bg-tone-blue-bg'
              : 'border-input bg-surface-subtle hover:bg-hover/60',
          )}
        >
          <UploadSimple className="size-7 text-muted-foreground" weight="duotone" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">Arraste arquivos .md ou .txt aqui</span>
          <span className="max-w-md text-[0.8125rem] text-muted-foreground">
            ou <span className="text-link group-hover:underline">escolha no computador</span>. Cada arquivo
            deve ter front-matter com fonte, versão e especialidade.
          </span>
          <input
            id="guideline-files"
            type="file"
            accept=".md,.txt"
            multiple
            className="sr-only"
            onChange={handleFileSelect}
          />
        </label>

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div className="space-y-2">
            {parseErrors.map((err, i) => (
              <Alert key={i} variant="destructive">
                <XCircle weight="fill" />
                <AlertTitle>{err.filename}</AlertTitle>
                <AlertDescription>
                  {err.error} — {err.action}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Upload queue */}
        {uploadItems.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <SectionHeader
              as="h3"
              title="Fila de ingestão"
              count={uploadItems.length}
              action={
                <Button
                  size="sm"
                  className="max-sm:h-10"
                  loading={uploading}
                  disabled={uploading || uploadItems.every((i) => i.status !== 'queued')}
                  onClick={() => void handleUpload()}
                >
                  <UploadSimple aria-hidden="true" />
                  {uploading ? 'Ingerindo...' : 'Ingerir lote'}
                </Button>
              }
            />
            <ul className="divide-y divide-border border-y border-border">
              {uploadItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3 px-2 py-2.5">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.filename}</p>
                    <p className="truncate text-[0.8125rem] text-muted-foreground">
                      {item.source} · v{item.sourceVersion} · {specialtyLabel(item.specialty)}
                      {item.evidenceLevel && ` · ${item.evidenceLevel}`}
                    </p>
                    {item.status === 'error' && item.error && (
                      <p className="mt-0.5 text-[0.8125rem] text-destructive">
                        {item.error} — {item.action}
                      </p>
                    )}
                  </div>
                  <UploadStatusTag status={item.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Pending chunks review */}
      <section className="flex flex-col gap-3" aria-labelledby="review-title">
        <SectionHeader
          title={<span id="review-title">Trechos em revisão</span>}
          count={
            pendingChunks.length > 0 ? (
              <Badge variant="warning">
                {pendingChunks.length} pendente{pendingChunks.length !== 1 ? 's' : ''}
              </Badge>
            ) : undefined
          }
          description="Aprovar publica o trecho na base consultada pelo Copiloto; rejeitar descarta com registro na auditoria."
        />
        {pendingQuery.isPending ? (
          <div className="divide-y divide-border border-y border-border" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 px-2 py-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-72 max-w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-7 w-40" />
              </div>
            ))}
          </div>
        ) : pendingQuery.error ? (
          <SectionError title="Erro ao carregar chunks" onRetry={() => void pendingQuery.refetch()} />
        ) : pendingChunks.length === 0 ? (
          <div className="border-y border-border">
            <EmptyState
              icon={<CheckCircle weight="duotone" />}
              title="Nenhum chunk pendente"
              description="Todos os chunks ingeridos foram revisados."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {pendingChunks.map((chunk) => (
              <PendingChunkRow key={chunk.id} chunk={chunk} />
            ))}
          </ul>
        )}
      </section>

      {/* Catalog table */}
      <section className="flex flex-col gap-3" aria-labelledby="catalog-title">
        <SectionHeader
          title={<span id="catalog-title">Catálogo de fontes</span>}
          count={sourcesQuery.isPending || sourcesQuery.error ? undefined : sources.length}
          description={`Ciclo de revisão: ${REVIEW_CYCLE_MONTHS} meses a partir da vigência.`}
        />
        {sourcesQuery.error ? (
          <SectionError title="Erro ao carregar catálogo" onRetry={() => void sourcesQuery.refetch()} />
        ) : (
          <DataTable
            columns={SOURCE_COLUMNS}
            rows={sources}
            getRowId={(source) => `${source.source}-${source.sourceVersion}-${source.validFrom}`}
            loading={sourcesQuery.isPending}
            loadingRows={4}
            ariaLabel="Catálogo de fontes de diretrizes"
            emptyState={
              <div className="border-y border-border">
                <EmptyState
                  icon={<Database weight="duotone" />}
                  title="Catálogo vazio"
                  description="Faça upload de diretrizes para iniciar o pipeline."
                />
              </div>
            }
          />
        )}
      </section>
    </Page>
  );
}
