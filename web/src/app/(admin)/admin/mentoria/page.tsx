'use client';

import { useState } from 'react';
import { ArrowClockwise, Stethoscope } from '@phosphor-icons/react';
import {
  asEnabledConfig,
  MENTORING_STATUS_LABEL,
  useMentoringAdmin,
  useMentoringConfig,
} from '@/lib/mentoring-queries';
import type { MentoringAdminItem, MentoringRequestStatus } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { Metric } from '../_components/metric';
import { PeriodToggle } from '../_components/period-toggle';
import { formatDuration } from '../_lib/format';

const PERIODS = [7, 30, 90] as const;
const numericCell = 'text-right tabular-nums';

const STATUS_VARIANT: Record<MentoringRequestStatus, 'warning' | 'blue' | 'success' | 'secondary'> =
  {
    pending: 'warning',
    claimed: 'blue',
    answered: 'success',
    cancelled: 'secondary',
  };

const STATUS_SHORT: Record<MentoringRequestStatus, string> = {
  pending: 'Aguardando',
  claimed: 'Em análise',
  answered: 'Respondido',
  cancelled: 'Cancelado',
};

function formatDecimal(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const COLUMNS: DataTableColumn<MentoringAdminItem>[] = [
  {
    key: 'createdAt',
    header: 'Pedido',
    cardLabel: null,
    cell: (row) => (
      <span className="flex flex-col gap-0.5 text-left">
        <span className="font-medium text-foreground tabular-nums">
          {formatDateTime(row.createdAt)}
        </span>
        <span className="text-[0.8125rem] text-muted-foreground">
          {row.requesterName ?? '—'}
          {row.institutionName ? ` · ${row.institutionName}` : ''}
        </span>
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (row) => (
      <Badge variant={STATUS_VARIANT[row.status]} title={MENTORING_STATUS_LABEL[row.status]}>
        {STATUS_SHORT[row.status]}
      </Badge>
    ),
  },
  { key: 'mentor', header: 'Mentor', cell: (row) => row.mentorName ?? '—' },
  {
    key: 'response',
    header: 'Tempo de resposta',
    className: numericCell,
    cell: (row) => formatDuration(row.responseMinutes),
  },
  {
    key: 'satisfaction',
    header: 'Nota',
    className: numericCell,
    cell: (row) => (row.satisfaction === null ? '—' : `${row.satisfaction} de 5`),
  },
  {
    key: 'terms',
    header: 'Termo',
    hideOnMobile: true,
    cell: (row) => (
      <span className="font-mono text-xs text-muted-foreground">{row.termsVersion}</span>
    ),
  },
];

/**
 * CC-707 — painel da mentoria em modo concierge: quantos pedem, quanto a
 * equipe demora e quanto a resposta ajudou. Mede a demanda antes de virar
 * produto pago. Só metadados; o texto do caso fica com o médico e o mentor.
 */
export default function MentoringAdminPage() {
  const config = useMentoringConfig();
  const enabled = asEnabledConfig(config.data) !== null;
  const [days, setDays] = useState<number>(30);
  const { data, isPending, error, refetch, isFetching } = useMentoringAdmin(days, enabled);

  if (!config.isPending && !enabled) {
    return (
      <Page width="narrow">
        <EmptyState
          icon={<Stethoscope weight="duotone" />}
          title="Mentoria desligada"
          description="Ligue COPILOT_MENTORING para oferecer a discussão de casos com a equipe."
        />
      </Page>
    );
  }

  const metrics = data?.metrics;
  const loading = config.isPending || isPending;
  const distribution = metrics?.satisfaction.distribution;

  return (
    <Page width="wide">
      <PageHeader
        icon={Stethoscope}
        title="Mentoria"
        description="Pedidos de discussão de caso com um médico da equipe: demanda, tempo de resposta e satisfação."
        actions={
          <>
            <PeriodToggle options={PERIODS} value={days} onChange={setDays} />
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:size-10"
              aria-label="Atualizar painel"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <ArrowClockwise aria-hidden="true" />
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o painel</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Demanda e resposta"
          description="Médico ativo = ao menos uma análise do copiloto no período."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Pedidos por médico ativo"
            value={metrics ? formatDecimal(metrics.requestsPerActivePhysician) : '—'}
            sub={
              metrics
                ? `${metrics.total} pedidos · ${metrics.activePhysicians} médicos ativos`
                : null
            }
            loading={loading}
            tone="highlight"
          />
          <Metric
            label="Tempo de resposta (mediana)"
            value={metrics ? formatDuration(metrics.responseMinutes.median) : '—'}
            sub={metrics ? `p90: ${formatDuration(metrics.responseMinutes.p90)}` : null}
            loading={loading}
          />
          <Metric
            label="Satisfação média"
            value={
              metrics?.satisfaction.average != null
                ? `${formatDecimal(metrics.satisfaction.average)} / 5`
                : '—'
            }
            sub={metrics ? `${metrics.satisfaction.rated} avaliações` : null}
            loading={loading}
          />
          <Metric
            label="Aguardando resposta"
            value={metrics ? String(metrics.byStatus.pending + metrics.byStatus.claimed) : '—'}
            sub={metrics ? `${metrics.requesters} médicos pediram` : null}
            loading={loading}
            tone={metrics && metrics.byStatus.pending > 0 ? 'warning' : 'default'}
          />
        </div>
        {distribution && metrics.satisfaction.rated > 0 && (
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            Notas: {distribution.map((count, index) => `${index + 1}★ ${count}`).join(' · ')}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Pedidos" count={data ? data.items.length : undefined} />
        <DataTable
          columns={COLUMNS}
          rows={data?.items ?? []}
          getRowId={(row) => row.id}
          loading={loading}
          loadingRows={3}
          ariaLabel="Pedidos de mentoria"
          emptyTitle="Nenhum pedido de mentoria no período."
        />
      </section>
    </Page>
  );
}
