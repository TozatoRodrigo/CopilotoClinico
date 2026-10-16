'use client';

import { useState } from 'react';
import type { BetaActivationCounts } from '@contracts/beta';
import { useBetaActivation } from '@/lib/beta-queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SectionHeader } from '@/components/layout/page-header';
import { Metric } from '../../_components/metric';
import { PeriodToggle } from '../../_components/period-toggle';
import { formatRate } from './beta-labels';

const PERIODS = [7, 30, 90] as const;

function belowTarget(rate: number | null, target: number): boolean {
  return rate !== null && rate < target;
}

function BatchRow({ label, counts }: { label: string; counts: BetaActivationCounts }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-2.5 text-sm">
      <span className="min-w-0 flex-1 font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground tabular-nums">
        {counts.registered} {counts.registered === 1 ? 'cadastro' : 'cadastros'} · {counts.eligible}{' '}
        com 24 h
      </span>
      <span className="text-foreground tabular-nums">
        {formatRate(counts.rate)} ativaram · {formatRate(counts.realCaseRate)} com caso real
      </span>
    </li>
  );
}

/**
 * CC-702 — ativação do beta (1ª análise em até 24 h do cadastro). Os mesmos
 * números saem de `GET /admin/beta/activation?days=` para o painel da CC-705.
 */
export function ActivationPanel() {
  const [days, setDays] = useState<number>(30);
  const query = useBetaActivation(days);
  const report = query.data;
  const target = report?.target ?? 0.7;
  const overall = report?.overall;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Ativação em 24 h"
        description={`Médicos cadastrados nos últimos ${days} dias que fizeram a 1ª análise em até 24 h. Meta: ${formatRate(target)}. Contas com menos de 24 h ainda não entram na taxa.`}
        action={<PeriodToggle options={PERIODS} value={days} onChange={setDays} />}
      />

      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar a ativação</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Ativação (qualquer caso)"
              value={formatRate(overall?.rate ?? null)}
              sub={overall ? `${overall.activated24h} de ${overall.eligible}` : undefined}
              tone={belowTarget(overall?.rate ?? null, target) ? 'warning' : 'highlight'}
              loading={query.isPending}
            />
            <Metric
              label="Com caso real"
              value={formatRate(overall?.realCaseRate ?? null)}
              sub="fora o caso de exemplo"
              loading={query.isPending}
            />
            <Metric
              label="Cadastros no período"
              value={overall?.registered ?? '—'}
              loading={query.isPending}
            />
            <Metric
              label="Com 24 h completas"
              value={overall?.eligible ?? '—'}
              loading={query.isPending}
            />
          </div>

          {report && report.byBatch.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="beta-activation-batches">
              <SectionHeader as="h3" title={<span id="beta-activation-batches">Por lote</span>} />
              <ul className="divide-y divide-border border-y border-border">
                {report.byBatch.map((batch) => (
                  <BatchRow
                    key={batch.batchLabel ?? '__sem_convite'}
                    label={batch.batchLabel ?? 'Sem convite'}
                    counts={batch}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
