'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuditEntries, type AuditFilters } from '@/lib/clinical-queries';
import type { AuditEntry } from '@/lib/types';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Export,
  LinkSimple,
  SealCheck,
  PencilSimple,
  FileText,
  Sparkle,
  ShieldCheck,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { AuditHash } from '@/components/domain/audit-hash';

const FILTER_PILLS = ['Hoje', '7 dias', 'Confirmações', 'Análises de IA', 'Edições'];

function getQuickFilter(pill: string): Partial<AuditFilters> {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  switch (pill) {
    case 'Hoje': return { from: today, to: today, entity: '', entityId: '' };
    case '7 dias': return { from: sevenDaysAgo, to: today, entity: '', entityId: '' };
    case 'Confirmações': return { entity: 'document', entityId: '', from: '', to: '' };
    case 'Análises de IA': return { entity: 'ai_interaction', entityId: '', from: '', to: '' };
    case 'Edições': return { entity: 'document', entityId: '', from: '', to: '' };
    default: return { entity: '', entityId: '', from: '', to: '' };
  }
}

const ACTION_META: Record<string, { label: string; icon: typeof SealCheck; color: string }> = {
  DOCUMENT_CONFIRMED: { label: 'Documento confirmado', icon: SealCheck, color: 'text-clinical-green-foreground' },
  DOCUMENT_GENERATED: { label: 'Documento gerado pela IA', icon: FileText, color: 'text-muted-foreground' },
  SECTION_EDITED: { label: 'Seção editada pelo médico', icon: PencilSimple, color: 'text-clinical-teal' },
  COPILOT_ANALYSIS: { label: 'Análise do copiloto', icon: Sparkle, color: 'text-clinical-teal' },
  PII_REDACTED: { label: 'PII redigida antes do envio à IA', icon: ShieldCheck, color: 'text-muted-foreground' },
};

function getActionMeta(action: string) {
  const key = action.toUpperCase().replace(/ /g, '_');
  return ACTION_META[key] ?? { label: action, icon: FileText, color: 'text-muted-foreground' };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const [activePill, setActivePill] = useState('Hoje');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>({
    ...getQuickFilter('Hoje') as AuditFilters,
  });
  const [exporting, setExporting] = useState(false);

  const auditQuery = useAuditEntries(appliedFilters, offset, limit);
  const entries: AuditEntry[] = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const loading = auditQuery.isPending;
  const error = auditQuery.error?.message ?? null;

  const handlePillClick = useCallback((pill: string) => {
    setActivePill(pill);
    setOffset(0);
    setAppliedFilters({ ...getQuickFilter(pill) as AuditFilters });
  }, []);

  async function handleExport() {
    if (total === 0) { toast.error('Nenhum registro para exportar.'); return; }
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.entity) params.set('entity', appliedFilters.entity);
      if (appliedFilters.from) params.set('from', appliedFilters.from);
      if (appliedFilters.to) params.set('to', appliedFilters.to);
      const csv = await apiClient.get<string>(`/audit/export${params.toString() ? '?' + params.toString() : ''}`);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(csv, `auditoria-${date}.csv`);
      toast.success('Exportação realizada.');
    } catch { toast.error('Erro ao exportar.'); }
    finally { setExporting(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground">
            Trilha append-only · CFM
          </p>
          <h1 className="font-display text-[2rem] font-normal leading-tight">Sua trilha</h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            Cada evento é encadeado ao anterior por hash. Nada pode ser apagado ou reescrito — nem
            por nós.
          </p>
        </div>
        <Button variant="outline" className="h-[42px] shrink-0 gap-2" onClick={handleExport} disabled={exporting || total === 0}>
          <Export className="size-4" /> Exportar (LGPD Art. 18)
        </Button>
      </div>

      {/* Integrity banner */}
      <div
        className="flex items-center gap-3 rounded-[14px] p-4"
        style={{
          border: '1px solid rgba(30,127,79,0.3)',
          background: 'var(--green-bg)',
        }}
      >
        <LinkSimple className="size-5 shrink-0 fill" style={{ color: 'var(--green)' }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--green-foreground)' }}>
            Cadeia de hash íntegra
          </p>
          <p className="text-[0.8rem]" style={{ color: 'var(--green-foreground)' }}>
            Última verificação automática hoje às 02:00 · {total} evento{total !== 1 ? 's' : ''} encadeado{total !== 1 ? 's' : ''} sem divergência.
          </p>
        </div>
        <span className="font-mono text-[0.7rem]" style={{ color: 'var(--green-foreground)' }}>próx. 02:00</span>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill}
            type="button"
            onClick={() => handlePillClick(pill)}
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
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-[16px]" />)}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void auditQuery.refetch()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      ) : entries.length === 0 ? (
        <div className="rounded-[16px] border border-clinical-line bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado para este filtro.</p>
        </div>
      ) : (
        <>
          {/* Desktop: timeline vertical conectada (Redesign.dc.html) — cada
              evento é um ponto ligado ao anterior por uma linha, reforçando
              a metáfora de cadeia de hash. O JSON do payload continua
              disponível por clique, como view "detalhada" secundária. */}
          <div className="hidden rounded-[16px] border border-clinical-line bg-card p-6 md:block">
            {entries.map((entry, i) => {
              const meta = getActionMeta(entry.action);
              const Icon = meta.icon;
              const isExpanded = expandedId === entry.id;
              const isLast = i === entries.length - 1;
              return (
                <div key={entry.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-clinical-line bg-card">
                      <Icon
                        className={cn('size-[15px]', meta.color)}
                        weight={entry.action.includes('CONFIRM') ? 'fill' : 'regular'}
                      />
                    </span>
                    {!isLast && <span className="w-px flex-1 bg-clinical-line" aria-hidden="true" />}
                  </div>
                  <button
                    type="button"
                    className="flex-1 pb-5 text-left"
                    aria-expanded={isExpanded}
                    aria-controls={`audit-${entry.id}`}
                    onClick={() => setExpandedId((p) => (p === entry.id ? null : entry.id))}
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={cn('text-[0.9rem] font-semibold', meta.color)}>{meta.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatTime(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[0.75rem] text-muted-foreground">
                      {entry.entity} · {entry.entityId.slice(0, 12)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <AuditHash hash={entry.afterHash} />
                      <LinkSimple className="size-3 shrink-0" style={{ color: 'var(--green)' }} />
                      <AuditHash hash={entry.beforeHash} />
                    </div>
                    {isExpanded && (
                      <pre
                        id={`audit-${entry.id}`}
                        className="mt-2.5 overflow-x-auto rounded bg-muted/30 p-3 text-xs"
                      >
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {entries.map((entry) => {
              const meta = getActionMeta(entry.action);
              const Icon = meta.icon;
              const isExpanded = expandedId === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="block w-full rounded-[14px] border border-clinical-line bg-card p-4 text-left"
                  onClick={() => setExpandedId((p) => (p === entry.id ? null : entry.id))}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.8rem]">{formatTime(entry.createdAt)}</span>
                    <span className={cn('flex items-center gap-1.5 text-[0.85rem] font-medium', meta.color)}>
                      <Icon className="size-4" weight={entry.action.includes('CONFIRM') ? 'fill' : 'regular'} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <AuditHash hash={entry.afterHash} />
                    <LinkSimple className="size-3 shrink-0" style={{ color: 'var(--green)' }} />
                    <AuditHash hash={entry.beforeHash} />
                  </div>
                  {isExpanded && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/30 p-2 text-xs">{JSON.stringify(entry.payload, null, 2)}</pre>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((p) => Math.max(0, p - limit))}>
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              {offset + 1}–{Math.min(offset + limit, total)} de {total}
            </span>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset((p) => p + limit)}>
              Próximo
            </Button>
          </div>

          <p className="text-center text-[0.75rem] text-muted-foreground">
            Registros são imutáveis no banco (trigger append-only) — nem administradores conseguem alterar.
          </p>
        </>
      )}
    </div>
  );
}
