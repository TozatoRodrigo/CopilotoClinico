'use client';

import { useState, useCallback, useRef } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/domain/empty-state';
import { cn } from '@/lib/utils';

const REVIEW_CYCLE_MONTHS = 6;

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function isReviewOverdue(validFrom: string): boolean {
  const reviewDate = new Date(validFrom);
  reviewDate.setMonth(reviewDate.getMonth() + REVIEW_CYCLE_MONTHS);
  return reviewDate < new Date();
}

function PipelineStep({
  label,
  count,
  active,
  done,
}: {
  label: string;
  count: number;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex size-7 items-center justify-center rounded-full text-xs font-semibold',
          done
            ? 'bg-clinical-green-bg text-clinical-green'
            : active
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
        )}
      >
        {done ? <Check className="size-3.5" /> : count}
      </div>
      <span
        className={cn(
          'text-xs font-medium',
          active ? 'text-foreground' : done ? 'text-clinical-green' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

function SourceRow({ source }: { source: GuidelineSourceSummary }) {
  const overdue = source.active && isReviewOverdue(source.validFrom);

  return (
    <div className="grid grid-cols-[2fr_1fr_0.7fr_1fr_0.8fr] items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{source.source}</p>
        {overdue && (
          <p className="flex items-center gap-1 text-[10px] text-clinical-amber">
            <Warning className="size-3" weight="fill" />
            Revisão vencida
          </p>
        )}
      </div>
      <div className="font-mono text-xs">{source.sourceVersion}</div>
      <div className="font-mono text-xs text-muted-foreground">{source.chunkCount} chunks</div>
      <div className="font-mono text-xs text-muted-foreground">{formatDate(source.validFrom)}</div>
      <div>
        {source.active ? (
          <Badge variant="outline" className="border-clinical-green/30 text-clinical-green">
            Ativo
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inativo
          </Badge>
        )}
      </div>
    </div>
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

  return (
    <div className="border-b px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{chunk.source}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              v{chunk.sourceVersion}
            </Badge>
            {chunk.evidenceLevel && (
              <Badge variant="secondary" className="text-[10px]">
                {chunk.evidenceLevel}
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {chunk.text.substring(0, 200)}
            {chunk.text.length > 200 ? '...' : ''}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Especialidade: {chunk.specialty} · {formatDate(chunk.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-clinical-green/30 text-clinical-green hover:bg-clinical-green-bg"
            disabled={loading !== null}
            onClick={() => handleAction('approve')}
          >
            <Check className="size-3.5" />
            {loading === 'approve' ? '...' : 'Aprovar'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-destructive/30 text-destructive hover:bg-destructive/5"
            disabled={loading !== null}
            onClick={() => handleAction('reject')}
          >
            <X className="size-3.5" />
            {loading === 'reject' ? '...' : 'Rejeitar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function GuidelinesConsolePage() {
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-primary" weight="duotone" />
          <h1 className="text-lg font-semibold tracking-tight">Diretrizes</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Console de ingestão do pipeline KB-002 — upload, curadoria e catálogo de fontes
        </p>
      </div>

      {/* Pipeline overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Esteira do pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <PipelineStep label="Fontes ativas" count={activeSources.length} done={activeSources.length > 0} />
            <ArrowRight className="size-4 text-muted-foreground" />
            <PipelineStep
              label="Em revisão"
              count={pendingChunks.length}
              active={pendingChunks.length > 0}
            />
            <ArrowRight className="size-4 text-muted-foreground" />
            <PipelineStep label="Publicadas" count={activeSources.length} done />
          </div>
          {overdueCount > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-clinical-amber-bg px-3 py-2 text-xs text-clinical-amber-foreground">
              <Warning className="size-4 text-clinical-amber" weight="fill" />
              {overdueCount} fonte(s) com revisão vencida (&gt; {REVIEW_CYCLE_MONTHS} meses). Atualize ou reeingere.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Upload em lote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed py-8 text-center transition-colors',
              dragOver
                ? 'border-primary bg-accent/30'
                : 'border-border hover:border-primary/40 hover:bg-accent/20',
            )}
          >
            <UploadSimple className="size-8 text-muted-foreground" weight="duotone" />
            <div>
              <p className="text-sm font-medium">Arraste arquivos .md ou .txt aqui</p>
              <p className="text-xs text-muted-foreground">
                Cada arquivo deve ter front-matter com fonte, versão e especialidade
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="space-y-2">
              {parseErrors.map((err, i) => (
                <Alert key={i} variant="destructive">
                  <XCircle className="size-4" />
                  <AlertTitle className="text-sm">{err.filename}</AlertTitle>
                  <AlertDescription className="text-xs">
                    {err.error} — {err.action}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Upload queue */}
          {uploadItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Fila de ingestão ({uploadItems.length})
                </span>
                <Button
                  size="sm"
                  disabled={uploading || uploadItems.every((i) => i.status !== 'queued')}
                  onClick={() => void handleUpload()}
                >
                  <UploadSimple className="mr-1 size-3.5" />
                  {uploading ? 'Ingerindo...' : 'Ingerir lote'}
                </Button>
              </div>
              <div className="space-y-1">
                {uploadItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.filename}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.source} · v{item.sourceVersion} · {item.specialty}
                        {item.evidenceLevel && ` · ${item.evidenceLevel}`}
                      </p>
                      {item.status === 'error' && item.error && (
                        <p className="mt-0.5 text-xs text-destructive">
                          {item.error} — {item.action}
                        </p>
                      )}
                    </div>
                    {item.status === 'queued' && <Clock className="size-4 text-muted-foreground" />}
                    {item.status === 'uploading' && (
                      <ArrowClockwise className="size-4 animate-spin text-primary" />
                    )}
                    {item.status === 'success' && (
                      <CheckCircle className="size-4 text-clinical-green" weight="fill" />
                    )}
                    {item.status === 'error' && (
                      <XCircle className="size-4 text-destructive" weight="fill" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending chunks review */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Chunks em revisão</CardTitle>
            {pendingChunks.length > 0 && (
              <Badge variant="secondary">{pendingChunks.length} pendente(s)</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pendingQuery.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : pendingQuery.error ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Erro ao carregar chunks</AlertTitle>
                <AlertDescription>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void pendingQuery.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : pendingChunks.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CheckCircle className="size-10" weight="duotone" />}
                title="Nenhum chunk pendente"
                description="Todos os chunks ingeridos foram revisados."
              />
            </div>
          ) : (
            <div>
              {pendingChunks.map((chunk) => (
                <PendingChunkRow key={chunk.id} chunk={chunk} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catalog table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Catálogo de fontes</CardTitle>
            {sourcesQuery.isPending ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <span className="text-xs text-muted-foreground">
                {sources.length} fonte(s) · ciclo de revisão: {REVIEW_CYCLE_MONTHS} meses
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sourcesQuery.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sourcesQuery.error ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Erro ao carregar catálogo</AlertTitle>
                <AlertDescription>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void sourcesQuery.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : sources.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Database className="size-10" weight="duotone" />}
                title="Catálogo vazio"
                description="Faça upload de diretrizes para iniciar o pipeline."
              />
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_0.7fr_1fr_0.8fr] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>Fonte</span>
                <span>Versão</span>
                <span>Chunks</span>
                <span>Desde</span>
                <span>Status</span>
              </div>
              {sources.map((source, i) => (
                <SourceRow key={`${source.source}-${source.sourceVersion}-${i}`} source={source} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
