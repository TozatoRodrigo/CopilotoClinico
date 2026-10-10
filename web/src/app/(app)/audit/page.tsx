'use client';

import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Export,
  Funnel,
  Hash,
  IdentificationBadge,
  LinkBreak,
  LinkSimple,
  ShieldCheck,
  Tag,
  TextAa,
  Warning,
} from '@phosphor-icons/react';
import { useAuditEntries, type AuditFilters } from '@/lib/clinical-queries';
import type { AuditEntry } from '@/lib/types';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { EmptyState } from '@/components/domain/empty-state';
import { AuditHash } from '@/components/domain/audit-hash';
import {
  ACTION_TONE_CLASS,
  ENTITY_OPTIONS,
  getActionMeta,
  getEntityMeta,
} from './_components/audit-meta';

const PAGE_SIZE = 20;
const ALL_ENTITIES = '_all';

type Period = 'today' | '7d' | '30d' | 'all' | 'custom';

const PERIOD_TABS: { value: Exclude<Period, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Tudo' },
];

/** Filtros como o médico os vê (datas `YYYY-MM-DD` do fuso local). */
interface FilterDraft {
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function periodRange(period: Exclude<Period, 'custom'>): Pick<FilterDraft, 'from' | 'to'> {
  const today = new Date();
  const daysBack = period === 'today' ? 0 : period === '7d' ? 6 : period === '30d' ? 29 : null;
  if (daysBack === null) return { from: '', to: '' };
  const start = new Date(today);
  start.setDate(today.getDate() - daysBack);
  return { from: toDateInput(start), to: toDateInput(today) };
}

function matchPeriod(from: string, to: string): Period {
  const match = PERIOD_TABS.find((tab) => {
    const range = periodRange(tab.value);
    return range.from === from && range.to === to;
  });
  return match?.value ?? 'custom';
}

/**
 * Converte o filtro visível para a API. As datas viram instantes do fuso do
 * navegador — `to` vai até 23:59:59.999 do dia, senão o `lte` do backend
 * (meia-noite UTC) deixava o próprio dia de fora e "Hoje" vinha vazio.
 */
function toApiFilters(draft: FilterDraft): AuditFilters {
  return {
    entity: draft.entity === ALL_ENTITIES ? '' : draft.entity,
    entityId: draft.entityId.trim(),
    from: draft.from ? new Date(`${draft.from}T00:00:00`).toISOString() : '',
    to: draft.to ? new Date(`${draft.to}T23:59:59.999`).toISOString() : '',
  };
}

function initialDraft(period: Exclude<Period, 'custom'>): FilterDraft {
  return { entity: ALL_ENTITIES, entityId: '', ...periodRange(period) };
}

function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EventLabel({ entry, className }: { entry: AuditEntry; className?: string }) {
  const meta = getActionMeta(entry.action);
  const Icon = meta.icon;
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <Icon
        className={cn('size-4 shrink-0', ACTION_TONE_CLASS[meta.tone])}
        weight={meta.tone === 'green' ? 'fill' : 'regular'}
        aria-hidden="true"
      />
      <span className="truncate font-medium text-foreground">{meta.label}</span>
    </span>
  );
}

function EntityTag({ entity }: { entity: string }) {
  const meta = getEntityMeta(entity);
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

/** Detalhe do evento (toggle): códigos crus, ator, IP, hashes completos e payload. */
function EventDetails({ entry }: { entry: AuditEntry }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      <PropertyList className="text-[0.8125rem]">
        <PropertyRow label="Código">
          <span className="font-mono text-xs">{entry.action}</span>
        </PropertyRow>
        <PropertyRow label="Entidade">
          <span className="font-mono text-xs break-all">
            {entry.entity} · {entry.entityId}
          </span>
        </PropertyRow>
        <PropertyRow label="Ator">
          <span className="font-mono text-xs break-all">{entry.actorId}</span>
        </PropertyRow>
        <PropertyRow label="Registrado em">
          <span className="tabular-nums">{new Date(entry.createdAt).toLocaleString('pt-BR')}</span>
        </PropertyRow>
        <PropertyRow label="IP">
          <span className="font-mono text-xs">{entry.ip ?? '—'}</span>
        </PropertyRow>
        <PropertyRow label="Hash do evento">
          <span className="font-mono text-xs break-all">{entry.afterHash ?? '—'}</span>
        </PropertyRow>
        <PropertyRow label="Elo anterior">
          <span className="font-mono text-xs break-all">{entry.beforeHash ?? '—'}</span>
        </PropertyRow>
      </PropertyList>
      {entry.payload ? (
        <pre className="max-h-72 overflow-auto rounded-md bg-tone-gray-bg p-3 font-mono text-xs leading-5 text-foreground">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      ) : (
        <p className="text-[0.8125rem] text-muted-foreground">Evento sem payload.</p>
      )}
    </div>
  );
}

function PrevHash({ hash }: { hash: string | null }) {
  // Sem elo = âncora da cadeia (primeiro evento) — não é falha.
  if (!hash) return <span className="text-xs text-muted-foreground">—</span>;
  return <AuditHash hash={hash} />;
}

export default function AuditPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [draft, setDraft] = useState<FilterDraft>(() => initialDraft('today'));
  const [applied, setApplied] = useState<FilterDraft>(draft);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const apiFilters = useMemo(() => toApiFilters(applied), [applied]);
  const auditQuery = useAuditEntries(apiFilters, offset, PAGE_SIZE);
  const entries: AuditEntry[] = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const loading = auditQuery.isPending;
  const error = auditQuery.error?.message ?? null;

  const rangeInvalid = Boolean(draft.from && draft.to && draft.from > draft.to);
  const hasExtraFilters =
    applied.entity !== ALL_ENTITIES || applied.entityId.trim() !== '' || period === 'custom';
  // Checagem local e honesta: todo evento gravado por AuditService.log tem
  // afterHash. A verificação criptográfica da cadeia inteira roda no backend
  // (AuditChainCronService, 02:00 UTC) e não é exposta para o front.
  const missingHash = entries.filter((entry) => !entry.afterHash).length;

  function apply(next: FilterDraft, nextPeriod: Period) {
    setDraft(next);
    setApplied(next);
    setPeriod(nextPeriod);
    setOffset(0);
    setExpandedId(null);
  }

  function handlePeriodChange(value: string) {
    if (value === 'custom') return;
    const nextPeriod = value as Exclude<Period, 'custom'>;
    apply({ ...draft, ...periodRange(nextPeriod) }, nextPeriod);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rangeInvalid) return;
    apply(draft, matchPeriod(draft.from, draft.to));
  }

  function handleClear() {
    apply(initialDraft('all'), 'all');
  }

  async function handleExport() {
    if (total === 0) {
      toast.error('Nenhum registro para exportar.');
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (apiFilters.entity) params.set('entity', apiFilters.entity);
      if (apiFilters.entityId) params.set('entityId', apiFilters.entityId);
      if (apiFilters.from) params.set('from', apiFilters.from);
      if (apiFilters.to) params.set('to', apiFilters.to);
      const query = params.toString();
      const csv = await apiClient.get<string>(`/audit/export${query ? `?${query}` : ''}`);
      downloadCsv(csv, `auditoria-${toDateInput(new Date())}.csv`);
      toast.success('Exportação realizada.');
    } catch {
      toast.error('Erro ao exportar.');
    } finally {
      setExporting(false);
    }
  }

  function toggle(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <Page width="wide">
      <PageHeader
        icon={ShieldCheck}
        title="Auditoria"
        description="Trilha append-only exigida pelo CFM. Cada evento é encadeado ao anterior por hash — nada pode ser apagado ou reescrito, nem por nós."
      />

      {/* Integridade da cadeia */}
      {loading ? (
        <Skeleton className="h-[4.5rem] w-full rounded-md" />
      ) : error || entries.length === 0 ? null : missingHash > 0 ? (
        <Alert variant="destructive">
          <LinkBreak weight="bold" />
          <AlertTitle>Evento sem hash na trilha</AlertTitle>
          <AlertDescription>
            {missingHash} evento{missingHash === 1 ? '' : 's'} desta página não{' '}
            {missingHash === 1 ? 'tem' : 'têm'} hash registrado — a cadeia pode ter sido violada.
            Exporte a trilha e acione a equipe técnica.
          </AlertDescription>
        </Alert>
      ) : (
        <Callout tone="green" icon={<LinkSimple weight="bold" />} title="Trilha encadeada por hash">
          {entries.length === 1
            ? 'O evento exibido tem hash registrado.'
            : `Os ${entries.length} eventos exibidos têm hash registrado.`}{' '}
          A cadeia completa é reverificada todo dia às 02:00 (UTC); qualquer divergência dispara
          alerta para a equipe técnica.
        </Callout>
      )}

      <Tabs value={period} onValueChange={handlePeriodChange} className="gap-4">
        {/* Barra de view do database: períodos à esquerda, exportar à direita. */}
        <div className="flex items-end justify-between gap-3 border-b border-border">
          <TabsList aria-label="Período" className="border-b-0">
            {PERIOD_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
            {period === 'custom' && <TabsTrigger value="custom">Personalizado</TabsTrigger>}
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            className="mb-1.5 max-sm:h-10"
            onClick={() => void handleExport()}
            loading={exporting}
            disabled={total === 0}
            title="Exporta todos os eventos do filtro atual (LGPD Art. 18)"
          >
            <Export />
            Exportar <span className="max-sm:hidden">CSV</span>
          </Button>
        </div>

        <form
          onSubmit={handleSubmit}
          aria-label="Filtros da trilha"
          className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        >
          <div className="col-span-2 flex flex-col gap-1.5 sm:w-48">
            <Label htmlFor="audit-entity">Entidade</Label>
            <Select
              value={draft.entity}
              onValueChange={(value) => setDraft((d) => ({ ...d, entity: value }))}
            >
              <SelectTrigger id="audit-entity" size="sm" className="w-full max-sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ENTITIES}>Todas as entidades</SelectItem>
                {ENTITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:w-56">
            <Label htmlFor="audit-entity-id">ID da entidade</Label>
            <Input
              id="audit-entity-id"
              value={draft.entityId}
              onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
              placeholder="Cole o ID"
              autoComplete="off"
              spellCheck={false}
              className="h-7 font-mono text-[0.8125rem] md:text-[0.8125rem]"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-36">
            <Label htmlFor="audit-from">De</Label>
            <Input
              id="audit-from"
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className="h-7 text-[0.8125rem] tabular-nums md:text-[0.8125rem]"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-36">
            <Label htmlFor="audit-to">Até</Label>
            <Input
              id="audit-to"
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              aria-invalid={rangeInvalid || undefined}
              aria-describedby={rangeInvalid ? 'audit-range-error' : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="h-7 text-[0.8125rem] tabular-nums md:text-[0.8125rem]"
            />
          </div>
          <div className="col-span-2 flex items-center gap-1.5">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={rangeInvalid}
              className="max-sm:h-10 max-sm:flex-1"
            >
              <Funnel />
              Filtrar
            </Button>
            {hasExtraFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-muted-foreground max-sm:h-10"
              >
                Limpar
              </Button>
            )}
          </div>
          {rangeInvalid && (
            <p id="audit-range-error" role="alert" className="col-span-2 text-xs text-destructive sm:basis-full">
              A data final é anterior à inicial.
            </p>
          )}
        </form>

        <TabsContent value={period} className="flex flex-col gap-3">
          {loading ? (
            <div className="divide-y divide-border border-y border-border" role="status" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-2 py-2.5">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24 max-md:hidden" />
                  <Skeleton className="ml-auto h-5 w-32" />
                </div>
              ))}
              <span className="sr-only">Carregando eventos…</span>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <Warning weight="fill" />
              <AlertTitle>Não foi possível carregar a trilha</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => void auditQuery.refetch()}>
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : entries.length === 0 ? (
            <div className="border-y border-border">
              <EmptyState
                icon={<ShieldCheck weight="duotone" />}
                title="Nenhum evento neste filtro"
                description="Ajuste o período ou a entidade para ver outros eventos da trilha."
                actionLabel={hasExtraFilters || period !== 'all' ? 'Ver todos os eventos' : undefined}
                onAction={handleClear}
              />
            </div>
          ) : (
            <>
              {/* Desktop: database do Notion. Cada linha abre o detalhe (toggle). */}
              <TableWrapper className="hidden md:block">
                <Table aria-label="Eventos da trilha de auditoria">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[34%]">
                        <span className="flex items-center gap-1.5">
                          <TextAa className="size-4" aria-hidden="true" /> Evento
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <Tag className="size-4" aria-hidden="true" /> Entidade
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <IdentificationBadge className="size-4" aria-hidden="true" /> ID
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <CalendarBlank className="size-4" aria-hidden="true" /> Quando
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <Hash className="size-4" aria-hidden="true" /> Hash
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="flex items-center gap-1.5">
                          <LinkSimple className="size-4" aria-hidden="true" /> Elo anterior
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const isExpanded = expandedId === entry.id;
                      const when = formatWhen(entry.createdAt);
                      return (
                        <Fragment key={entry.id}>
                          <TableRow className={cn(isExpanded && 'bg-hover/60')}>
                            <TableCell className="p-0">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={`audit-${entry.id}`}
                                onClick={() => toggle(entry.id)}
                                className="flex h-9 w-full min-w-0 items-center gap-1.5 px-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset"
                              >
                                <CaretRight
                                  weight="fill"
                                  aria-hidden="true"
                                  className={cn(
                                    'size-3 shrink-0 text-muted-foreground transition-transform duration-150',
                                    isExpanded && 'rotate-90',
                                  )}
                                />
                                <EventLabel entry={entry} />
                              </button>
                            </TableCell>
                            <TableCell>
                              <EntityTag entity={entry.entity} />
                            </TableCell>
                            <TableCell
                              className="font-mono text-xs whitespace-nowrap text-muted-foreground"
                              title={entry.entityId}
                            >
                              {entry.entityId.slice(0, 12)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums">
                              {when.date} <span className="text-muted-foreground">{when.time}</span>
                            </TableCell>
                            <TableCell>
                              <AuditHash hash={entry.afterHash} />
                            </TableCell>
                            <TableCell>
                              <PrevHash hash={entry.beforeHash} />
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell id={`audit-${entry.id}`} colSpan={6} className="bg-surface-subtle px-8 py-3">
                                <EventDetails entry={entry} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableWrapper>

              {/* Mobile: lista com divisórias; hash fora do botão (tem o próprio botão de copiar). */}
              <ul className="divide-y divide-border border-y border-border md:hidden" aria-label="Eventos da trilha de auditoria">
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const when = formatWhen(entry.createdAt);
                  return (
                    <li key={entry.id} className="py-2">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`audit-m-${entry.id}`}
                        onClick={() => toggle(entry.id)}
                        className="flex min-h-11 w-full items-start gap-2 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      >
                        <CaretRight
                          weight="fill"
                          aria-hidden="true"
                          className={cn(
                            'mt-1 size-3 shrink-0 text-muted-foreground transition-transform duration-150',
                            isExpanded && 'rotate-90',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <EventLabel entry={entry} className="text-sm" />
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <EntityTag entity={entry.entity} />
                            <span className="tabular-nums">
                              {when.date} · {when.time}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-1 pl-6">
                        <AuditHash hash={entry.afterHash} />
                        {entry.beforeHash && (
                          <>
                            <span className="text-xs text-muted-foreground">←</span>
                            <AuditHash hash={entry.beforeHash} />
                          </>
                        )}
                      </div>
                      {isExpanded && (
                        <div id={`audit-m-${entry.id}`} className="pl-6">
                          <EventDetails entry={entry} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Rodapé do database: contagem + paginação */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
                  {pageStart}–{pageEnd} de {total} evento{total === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="max-sm:h-10"
                    disabled={offset === 0}
                    onClick={() => {
                      setExpandedId(null);
                      setOffset((p) => Math.max(0, p - PAGE_SIZE));
                    }}
                  >
                    <CaretLeft />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="max-sm:h-10"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => {
                      setExpandedId(null);
                      setOffset((p) => p + PAGE_SIZE);
                    }}
                  >
                    Próximo
                    <CaretRight />
                  </Button>
                </div>
              </div>
            </>
          )}

          <p className="px-1 text-xs text-pretty text-muted-foreground">
            Registros imutáveis no banco (trigger append-only) — nem administradores conseguem
            alterar. A exportação inclui todos os eventos do filtro atual (até 10 mil), em
            atendimento à LGPD Art. 18.
          </p>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
