'use client';

import { useRef, useState, type FormEvent } from 'react';
import { MagnifyingGlass, Prohibit } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeader } from '@/components/layout/page-header';
import type {
  AiCallReportPeriod,
  AiCallRequestSummary,
  AiCallStageModelRow,
  AiCallTraceRow,
} from '@contracts/ai-calls';
import {
  AI_CALL_REPORT_PERIODS,
  DEFAULT_AI_CALL_PERIOD,
  FAILURE_OUTCOMES,
  formatLatency,
  formatRate,
  formatUsd,
  outcomeLabel,
  stageLabel,
  useAiCallReport,
  useAiCallRequestTrace,
} from '../_lib/ai-calls';
import { formatRelative } from '../_lib/format';
import { LoadError } from './load-error';
import { Metric } from './metric';
import { PeriodToggle } from './period-toggle';

const numericCell = 'text-right tabular-nums whitespace-nowrap';

/** "2 erros · 1 truncada" — só os desfechos que aconteceram. */
function failureBreakdown(row: AiCallStageModelRow): string {
  return FAILURE_OUTCOMES.filter((outcome) => row.outcomes[outcome] > 0)
    .map((outcome) => {
      const count = row.outcomes[outcome];
      return `${count} ${outcomeLabel(outcome)}${count > 1 ? 's' : ''}`;
    })
    .join(' · ');
}

const stageModelColumns: DataTableColumn<AiCallStageModelRow>[] = [
  {
    key: 'stage',
    header: 'Etapa e modelo',
    cardLabel: null,
    cell: (row) => (
      <div className="min-w-0 text-left">
        <p className="font-medium text-foreground">{stageLabel(row.stage)}</p>
        <p className="truncate font-mono text-[0.8125rem] text-muted-foreground">
          {row.provider} · {row.model}
        </p>
      </div>
    ),
  },
  { key: 'calls', header: 'Chamadas', className: numericCell, cell: (row) => row.calls },
  {
    key: 'cost',
    header: 'Custo total',
    className: numericCell,
    cell: (row) => formatUsd(row.totalCostUsd),
  },
  {
    key: 'avg-cost',
    header: 'Custo médio',
    className: numericCell,
    cell: (row) => formatUsd(row.avgCostUsd),
  },
  {
    key: 'p50',
    header: 'p50',
    className: numericCell,
    cell: (row) => formatLatency(row.latency.p50Ms),
  },
  {
    key: 'p95',
    header: 'p95',
    className: numericCell,
    cell: (row) => formatLatency(row.latency.p95Ms),
  },
  {
    key: 'failures',
    header: 'Falhas',
    className: numericCell,
    cell: (row) =>
      row.failures === 0 ? (
        '0'
      ) : (
        <div className="flex flex-col items-end">
          <span>
            {row.failures} · {formatRate(row.failureRate)}
          </span>
          <span className="text-xs text-muted-foreground">{failureBreakdown(row)}</span>
          {row.usageLimitErrors > 0 && (
            <span className="text-xs text-tone-orange-ink">
              {row.usageLimitErrors} por limite de uso
            </span>
          )}
        </div>
      ),
  },
];

const requestColumns: DataTableColumn<AiCallRequestSummary>[] = [
  {
    key: 'request',
    header: 'Requisição',
    cardLabel: null,
    cell: (row) => (
      <div className="min-w-0 text-left">
        <p className="truncate font-mono text-[0.8125rem] text-foreground">{row.requestId}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.stages.map(stageLabel).join(' · ')}
        </p>
      </div>
    ),
  },
  {
    key: 'started',
    header: 'Início',
    hideOnMobile: true,
    cell: (row) => formatRelative(row.startedAt),
  },
  { key: 'calls', header: 'Chamadas', className: numericCell, cell: (row) => row.calls },
  { key: 'failures', header: 'Falhas', className: numericCell, cell: (row) => row.failures },
  {
    key: 'cost',
    header: 'Custo',
    className: numericCell,
    cell: (row) => formatUsd(row.totalCostUsd),
  },
];

function outcomeBadge(row: AiCallTraceRow) {
  if (row.outcome === 'ok') return <Badge variant="gray">ok</Badge>;
  return (
    <Badge variant={row.outcome === 'error' ? 'destructive' : 'warning'}>
      {outcomeLabel(row.outcome)}
    </Badge>
  );
}

function TokensCell({ row }: { row: AiCallTraceRow }) {
  if (row.promptTokens === null && row.completionTokens === null) return '—';
  return (
    <div className="flex flex-col items-end">
      <span>
        {(row.promptTokens ?? 0).toLocaleString('pt-BR')} →{' '}
        {(row.completionTokens ?? 0).toLocaleString('pt-BR')}
      </span>
      {row.cacheReadTokens ? (
        <span className="text-xs text-muted-foreground">
          {row.cacheReadTokens.toLocaleString('pt-BR')} em cache
        </span>
      ) : null}
    </div>
  );
}

const traceColumns: DataTableColumn<AiCallTraceRow>[] = [
  {
    key: 'stage',
    header: 'Etapa',
    cardLabel: null,
    cell: (row) => (
      <div className="min-w-0 text-left">
        <p className="font-medium text-foreground">{stageLabel(row.stage)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {new Date(row.createdAt).toLocaleTimeString('pt-BR')} · prompt {row.promptVersion}
        </p>
      </div>
    ),
  },
  {
    key: 'model',
    header: 'Modelo',
    cell: (row) => (
      <span className="font-mono text-[0.8125rem] whitespace-nowrap">
        {row.servedModel ?? row.requestedModel}
        {row.effort ? ` · ${row.effort}` : ''}
      </span>
    ),
  },
  {
    key: 'tokens',
    header: 'Tokens (entrada → saída)',
    hideOnMobile: true,
    className: numericCell,
    cell: (row) => <TokensCell row={row} />,
  },
  { key: 'cost', header: 'Custo', className: numericCell, cell: (row) => formatUsd(row.costUsd) },
  {
    key: 'latency',
    header: 'Latência',
    className: numericCell,
    cell: (row) => formatLatency(row.latencyMs),
  },
  {
    key: 'outcome',
    header: 'Desfecho',
    cell: (row) => (
      <div className="flex flex-col items-start gap-0.5">
        {outcomeBadge(row)}
        {row.errorType && (
          <span className="font-mono text-xs text-muted-foreground">{row.errorType}</span>
        )}
      </div>
    ),
  },
];

/**
 * CC-004 — custo, latência e falhas das chamadas de IA por etapa e modelo, a
 * partir de `ai_calls`, e a busca pelo `x-request-id` de uma requisição.
 * Só metadados: nenhum texto do caso, e nenhum id de médico ou paciente.
 */
export function AiCallsPanel() {
  const [period, setPeriod] = useState<AiCallReportPeriod>(DEFAULT_AI_CALL_PERIOD);
  const { data, isPending, error, refetch } = useAiCallReport(period);

  const [searchInput, setSearchInput] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const searchSection = useRef<HTMLElement>(null);

  function search(id: string) {
    const trimmed = id.trim();
    setSearchInput(trimmed);
    setRequestId(trimmed === '' ? null : trimmed);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(searchInput);
  }

  const totals = data?.totals;
  const analyses = data?.analyses;

  return (
    <div className="flex flex-col gap-8">
      <PeriodToggle
        options={AI_CALL_REPORT_PERIODS}
        value={period}
        onChange={setPeriod}
        className="self-start"
      />

      {error && (
        <LoadError
          title="Não foi possível carregar as chamadas de IA"
          message={error.message}
          onRetry={() => void refetch()}
        />
      )}

      {totals && totals.usageLimitErrors > 0 && (
        <Callout
          tone="orange"
          icon={<Prohibit weight="fill" />}
          title="Provedor recusou chamadas por limite de uso"
        >
          {totals.usageLimitErrors}{' '}
          {totals.usageLimitErrors === 1 ? 'chamada recusada' : 'chamadas recusadas'} por limite de
          uso ou falta de crédito no período. Enquanto durar, as análises falham: ajuste o limite no
          console do provedor.
        </Callout>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Totais do período" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Custo total"
            value={totals ? formatUsd(totals.totalCostUsd) : '—'}
            sub={totals ? `${totals.calls} chamadas` : null}
            loading={isPending}
            tone="highlight"
          />
          <Metric
            label="Custo por análise completa"
            value={analyses ? formatUsd(analyses.avgCostUsd) : '—'}
            sub={
              analyses ? `${analyses.count} ${analyses.count === 1 ? 'análise' : 'análises'}` : null
            }
            loading={isPending}
          />
          <Metric
            label="Latência p95"
            value={totals ? formatLatency(totals.latency.p95Ms) : '—'}
            sub={totals ? `p50 ${formatLatency(totals.latency.p50Ms)}` : null}
            loading={isPending}
          />
          <Metric
            label="Falhas"
            value={totals ? formatRate(totals.failureRate) : '—'}
            sub={totals ? `${totals.failures} de ${totals.calls} chamadas` : null}
            loading={isPending}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Por etapa e modelo"
          description="Modelo pedido pelo roteamento. Falha é todo desfecho diferente de ok."
          count={data ? data.byStageModel.length : undefined}
        />
        <DataTable
          columns={stageModelColumns}
          rows={data?.byStageModel ?? []}
          getRowId={(row) => `${row.stage}:${row.provider}:${row.model}`}
          loading={isPending}
          loadingRows={4}
          ariaLabel="Chamadas de IA por etapa e modelo"
          emptyTitle="Sem chamadas de IA no período."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Requisições mais caras"
          description="Clique para ver as chamadas da requisição."
          count={data ? data.costliestRequests.length : undefined}
        />
        <DataTable
          columns={requestColumns}
          rows={data?.costliestRequests ?? []}
          getRowId={(row) => row.requestId}
          onRowClick={(row) => {
            search(row.requestId);
            searchSection.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          }}
          loading={isPending}
          loadingRows={3}
          ariaLabel="Requisições mais caras do período"
          emptyTitle="Sem requisições no período."
        />
      </section>

      <section ref={searchSection} className="flex scroll-mt-16 flex-col gap-3">
        <SectionHeader
          title="Buscar requisição"
          description="O x-request-id vem no cabeçalho da resposta da API e no log."
        />
        <form role="search" onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="ai-call-request-id">x-request-id</Label>
            <Input
              id="ai-call-request-id"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ex.: 3f2c9a1e-…"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
          <Button type="submit" variant="outline" className="max-sm:h-10">
            <MagnifyingGlass aria-hidden="true" />
            Buscar
          </Button>
        </form>
        {requestId !== null && <RequestTrace requestId={requestId} />}
      </section>

      {data && <p className="text-xs text-muted-foreground">{data.disclaimer}</p>}
    </div>
  );
}

function RequestTrace({ requestId }: { requestId: string }) {
  const { data, isPending, error, refetch } = useAiCallRequestTrace(requestId);

  if (error) {
    return error.status === 400 ? (
      <Callout tone="gray">
        Esse não é um x-request-id: são de 8 a 64 caracteres, só letras, números, ponto, hífen ou
        sublinhado.
      </Callout>
    ) : (
      <LoadError
        title="Não foi possível buscar a requisição"
        message={error.message}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data && data.calls.length > 0 && (
        <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
          {data.calls.length} {data.calls.length === 1 ? 'chamada' : 'chamadas'} ·{' '}
          {formatUsd(data.totalCostUsd)} · {formatLatency(data.totalLatencyMs)} somados
        </p>
      )}
      <DataTable
        columns={traceColumns}
        rows={data?.calls ?? []}
        getRowId={(row) => row.id}
        loading={isPending}
        loadingRows={3}
        ariaLabel={`Chamadas da requisição ${requestId}`}
        emptyTitle="Nenhuma chamada de IA com esse x-request-id."
      />
    </div>
  );
}
