'use client';

import Link from 'next/link';
import { ArrowClockwise, ArrowLeft, Scales } from '@phosphor-icons/react';
import type { KnowledgeCardStatus } from '@contracts/knowledge-cards';
import type { KnowledgeCardDivergenceSummary } from '@contracts/knowledge-card-review';
import { useCrossReviewSummary } from '@/lib/card-review-queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/domain/empty-state';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';

const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

function percent(rate: number | null): string {
  return rate === null ? '—' : PERCENT.format(rate);
}

/** "4 min 30 s"; a meta do CC-404 é revisar um cartão em até 6 minutos. */
function minutes(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins === 0 ? `${secs} s` : `${mins} min${secs > 0 ? ` ${secs} s` : ''}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Onde o cartão está depois da divergência; o texto diz o estado, não só a cor. */
const CARD_STATUS: Record<
  KnowledgeCardStatus,
  { label: string; variant: 'blue' | 'success' | 'secondary' }
> = {
  in_review: { label: 'Na fila de revisão', variant: 'blue' },
  published: { label: 'Publicado de novo', variant: 'success' },
  archived: { label: 'Descartado', variant: 'secondary' },
  draft: { label: 'Rascunho', variant: 'secondary' },
};

function DivergenceItem({ divergence }: { divergence: KnowledgeCardDivergenceSummary }) {
  const status = CARD_STATUS[divergence.cardStatus];
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="purple">{divergence.topic}</Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {formatDate(divergence.reviewedAt)}
        </span>
      </div>
      <p className="text-sm font-medium text-pretty text-foreground">{divergence.question}</p>
      <p className="text-[0.8125rem] text-muted-foreground">
        Versão {divergence.disputedVersion} aprovada por{' '}
        {divergence.firstReviewer.name ?? 'um médico'};{' '}
        {divergence.crossReviewer.name ?? 'o segundo médico'} divergiu
        {divergence.correctionVersion !== null
          ? ` e corrigiu (versão ${divergence.correctionVersion})`
          : ''}
        .
      </p>
      <blockquote className="border-l-2 border-border pl-3 text-sm text-pretty text-foreground">
        “{divergence.reason}”
      </blockquote>
    </li>
  );
}

/**
 * CC-411 — painel da revisão cruzada: quanto os segundos médicos concordam
 * com a primeira aprovação (meta: divergência abaixo de 5%), o que espera
 * revisão e as divergências recentes — os erros que um revisor sozinho
 * deixou passar.
 */
export default function CrossReviewAgreementPage() {
  const summary = useCrossReviewSummary();
  const data = summary.data;
  const done = data ? data.agreed + data.diverged : 0;
  const aboveTarget =
    data?.divergenceRate !== null &&
    data?.divergenceRate !== undefined &&
    data.divergenceRate >= data.divergenceTarget;

  return (
    <Page width="default">
      <PageHeader
        size="compact"
        title="Concordância da revisão cruzada"
        description="10% das aprovações, sorteadas pela versão, são lidas de novo por um segundo médico. Meta: divergência abaixo de 5%."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/revisao">
              <ArrowLeft aria-hidden="true" />
              Voltar à fila
            </Link>
          </Button>
        }
      />

      {summary.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="status" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
          <span className="sr-only">Carregando o painel…</span>
        </div>
      ) : summary.error ? (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar o painel</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{summary.error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void summary.refetch()}>
              <ArrowClockwise aria-hidden="true" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : data ? (
        <>
          <section aria-labelledby="cross-review-rates" className="flex flex-col gap-3">
            <h2 id="cross-review-rates" className="sr-only">
              Taxas da revisão cruzada
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Concordância"
                value={percent(data.agreementRate)}
                sublabel={`${data.agreed} de ${done} revisões cruzadas`}
              />
              <StatCard
                label="Divergência"
                value={percent(data.divergenceRate)}
                variant={aboveTarget ? 'highlight' : 'default'}
                sublabel={
                  aboveTarget
                    ? `Fora da meta: abaixo de ${percent(data.divergenceTarget)}`
                    : `Meta: abaixo de ${percent(data.divergenceTarget)}`
                }
              />
              <StatCard
                label="Esperando segundo médico"
                value={data.pending}
                sublabel={
                  data.superseded === 0
                    ? 'Versões ainda no ar'
                    : `${data.superseded} ${data.superseded === 1 ? 'saiu' : 'saíram'} do ar antes da revisão`
                }
              />
              <StatCard
                label="Tempo mediano de revisão"
                value={minutes(data.reviewTime.medianMs)}
                sublabel={`${data.reviewTime.decisions} decisões recentes · meta 6 min`}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {data.approvals} aprovações · {data.sampled} sorteadas ({data.samplePercent}%)
            </p>
          </section>

          <section aria-labelledby="recent-divergences" className="flex flex-col gap-2">
            <SectionHeader
              title={<span id="recent-divergences">Divergências recentes</span>}
              count={data.recentDivergences.length}
              description="O cartão saiu do ar com a correção do segundo médico e voltou para a fila."
            />
            {data.recentDivergences.length === 0 ? (
              <div className="border-y border-border">
                <EmptyState
                  icon={<Scales weight="duotone" />}
                  title={done === 0 ? 'Nenhuma revisão cruzada feita ainda' : 'Nenhuma divergência'}
                  description={
                    done === 0
                      ? 'As aprovações sorteadas aparecem na fila de revisão de outro médico.'
                      : 'Os segundos médicos concordaram com todas as aprovações revistas.'
                  }
                />
              </div>
            ) : (
              <ul
                aria-label="Divergências recentes"
                className="divide-y divide-border border-y border-border"
              >
                {data.recentDivergences.map((divergence) => (
                  <DivergenceItem key={divergence.crossReviewId} divergence={divergence} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </Page>
  );
}
