'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowClockwise,
  ChartBar,
  Coins,
  CurrencyDollar,
  DownloadSimple,
  Funnel,
  Warning,
} from '@phosphor-icons/react';
import { apiClient, ApiError } from '@/lib/api-client';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Callout } from '@/components/ui/callout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Disclosure } from '@/components/ui/disclosure';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/domain/empty-state';
import {
  DEFAULT_COST_DAYS,
  DEFAULT_PROJECTED_USERS,
  formatCost,
  useAiCostReport,
  type AiCostReport,
  type CostByModel,
  type CostByPhysician,
} from '../_lib/ai-cost';
import { ColumnChart, FunnelBars, RateMeter, ShareMeter } from '../_components/charts';
import { formatDay } from '../_lib/format';
import { Metric } from '../_components/metric';
import { PeriodToggle } from '../_components/period-toggle';

interface DecisionLoopFunnel {
  analysesStarted: number;
  encountersWithBlockers: number;
  blockerQuestionsEmitted: number;
  blockerQuestionsAnswered: number;
  blockerAnswerRate: number;
  reachedConduta: number;
  avgTurnsToConduta: number | null;
  abandoned: number;
  abandonmentRate: number;
  confirmedDocuments: number;
  uncertaintyRate: number;
}

interface ActivationFunnel {
  registered: number;
  withEncounter: number;
  withAnalysis: number;
  withConfirmation: number;
}

interface ProductFunnel {
  period: string;
  demoCase: string | null;
  decisionLoop: DecisionLoopFunnel;
  activation: ActivationFunnel;
  generatedAt: string;
}

const ABANDONMENT_ALERT_THRESHOLD = 0.3;

type AnalyticsTab = 'funil' | 'custo';

export default function AnalyticsPage() {
  const [tab, setTab] = useState<AnalyticsTab>('funil');

  return (
    <Page width="default">
      <PageHeader
        icon={ChartBar}
        title="Analytics"
        description="Funil de produto e custo de IA — agregados LGPD-safe (nenhum dado de paciente)."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as AnalyticsTab)} className="gap-0">
        <TabsList className="w-full max-sm:group-data-horizontal/tabs:h-10">
          <TabsTrigger value="funil">
            <Funnel aria-hidden="true" />
            Funil de produto
          </TabsTrigger>
          <TabsTrigger value="custo">
            <Coins aria-hidden="true" />
            Custo de IA
          </TabsTrigger>
        </TabsList>
        <TabsContent value="funil" className="pt-6">
          <FunnelPanel />
        </TabsContent>
        <TabsContent value="custo" className="pt-6">
          <CostPanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <ArrowClockwise aria-hidden="true" />
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function FunnelPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // S25-ANALYTICS-01 — filtros na URL para serem compartilháveis.
  // Antes: estado local isolado; agora: ?days=7&demoCase=sindrome-gripal.
  const [days, setDays] = useState(Number(searchParams.get('days') ?? '7') || 7);
  const [demoCase, setDemoCase] = useState(searchParams.get('demoCase') ?? '');

  function syncUrl(nextDays: number, nextDemoCase: string) {
    const params = new URLSearchParams();
    if (nextDays) params.set('days', String(nextDays));
    if (nextDemoCase) params.set('demoCase', nextDemoCase);
    router.replace(`/admin/analytics?${params.toString()}`, { scroll: false });
  }

  const { data, isPending, error, refetch } = useQuery<ProductFunnel, ApiError>({
    queryKey: ['product-funnel', days, demoCase],
    queryFn: () =>
      apiClient.get<ProductFunnel>('/analytics/funnel', {
        days: String(days),
        ...(demoCase ? { demoCase } : {}),
      }),
  });

  const dl = data?.decisionLoop;
  const act = data?.activation;
  const abandonmentHigh = (dl?.abandonmentRate ?? 0) > ABANDONMENT_ALERT_THRESHOLD;

  return (
    <div className="flex flex-col gap-8">
      {/* Barra de filtros do database (uma linha, acima dos gráficos). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/*
          S25-ANALYTICS-01 — demoCase vira Select (antes era input texto
          que disparava request a cada tecla). Casos conhecidos vêm de
          DEMO_CASE_PRESETS. Valor "_all" = sem filtro (todos os casos).
        */}
        <div className="flex items-center gap-2">
          <Label htmlFor="funnel-demo-case">Caso-norte</Label>
          <Select
            value={demoCase || '_all'}
            onValueChange={(v) => {
              const next = v === '_all' ? '' : v;
              setDemoCase(next);
              syncUrl(days, next);
            }}
          >
            <SelectTrigger id="funnel-demo-case" size="sm" className="w-48 text-[0.8125rem] max-sm:h-10">
              <SelectValue placeholder="Todos os casos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os casos</SelectItem>
              {DEMO_CASE_PRESETS.map((preset) => (
                <SelectItem key={preset.slug} value={preset.slug}>
                  {preset.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PeriodToggle
          options={[7, 30]}
          value={days}
          onChange={(d) => {
            setDays(d);
            syncUrl(d, demoCase);
          }}
        />
      </div>

      {error && (
        <LoadError
          title="Não foi possível carregar o funil"
          message={error.message}
          onRetry={() => void refetch()}
        />
      )}

      {/* Decision loop — the #1 metric */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Loop de decisão"
          description="Da pergunta bloqueadora à conduta fechada. A métrica nº 1 é a taxa de perguntas respondidas."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="% perguntas blocker respondidas"
            value={dl ? pct(dl.blockerAnswerRate) : '—'}
            sub={dl ? `${dl.blockerQuestionsAnswered} de ${dl.blockerQuestionsEmitted} perguntas` : null}
            loading={isPending}
            tone="highlight"
            badge={<Badge variant="default" className="bg-background/70">métrica nº 1</Badge>}
          >
            {dl && <RateMeter rate={dl.blockerAnswerRate} />}
          </Metric>
          <Metric
            label="Turnos médios até conduta"
            value={dl ? formatDecimal(dl.avgTurnsToConduta) : '—'}
            sub={dl ? `${dl.reachedConduta} condutas fechadas` : null}
            loading={isPending}
          />
          <Metric
            label="Taxa de abandono do loop"
            value={dl ? pct(dl.abandonmentRate) : '—'}
            sub={dl ? `${dl.abandoned} de ${dl.encountersWithBlockers} atendimentos` : null}
            loading={isPending}
            tone={abandonmentHigh ? 'warning' : 'default'}
          >
            {dl && <RateMeter rate={dl.abandonmentRate} tone={abandonmentHigh ? 'orange' : 'blue'} />}
          </Metric>
          <Metric
            label="Documentos confirmados"
            value={dl ? String(dl.confirmedDocuments) : '—'}
            sub={dl ? `${dl.analysesStarted} análises iniciadas` : null}
            loading={isPending}
          />
        </div>
        {abandonmentHigh && (
          <Callout tone="orange" icon={<Warning weight="fill" />}>
            Abandono acima de {pct(ABANDONMENT_ALERT_THRESHOLD)} — sinal de fricção na UI do copiloto.
          </Callout>
        )}
      </section>

      {/* Activation funnel */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Ativação"
          description="Médicos que chegaram a cada etapa no período."
        />
        <div className="rounded-lg border border-border px-4 py-4">
          {isPending ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : act ? (
            <FunnelBars
              steps={[
                { label: 'Cadastro', value: act.registered },
                { label: '1º atendimento', value: act.withEncounter },
                { label: '1ª análise', value: act.withAnalysis },
                { label: '1ª confirmação', value: act.withConfirmation },
              ]}
            />
          ) : (
            <EmptyState
              icon={<ChartBar weight="duotone" />}
              title="Sem dados de ativação"
              description="Recarregue o funil para ver as etapas do período."
              className="py-6"
            />
          )}
        </div>
      </section>
    </div>
  );
}

function downloadCostCsv(report: AiCostReport) {
  const lines: string[] = [];
  lines.push('Painel de custo de IA — Copiloto Clínico');
  lines.push(`Período,${report.period.days} dias`);
  lines.push(`Gerado em,${report.period.generatedAt}`);
  lines.push('');
  lines.push('Totais');
  lines.push('Custo total (USD),Nº de análises,Nº de casos,Custo médio por caso,Custo médio por análise,Turnos médios por caso');
  lines.push(
    [
      report.totals.totalCost,
      report.totals.interactionCount,
      report.totals.encounterCount,
      report.totals.avgCostPerCase ?? '',
      report.totals.avgCostPerAnalysis ?? '',
      report.totals.avgTurnsPerCase ?? '',
    ].join(','),
  );
  lines.push('');
  lines.push('Projeção');
  lines.push('Usuários projetados,Custo médio por médico/mês (USD),Custo mensal projetado (USD)');
  lines.push(
    [
      report.projection.projectedUsers,
      report.projection.avgCostPerPhysicianPerMonth ?? '',
      report.projection.projectedMonthlyCost ?? '',
    ].join(','),
  );
  lines.push('');
  lines.push('Custo por médico');
  lines.push('Nome,E-mail,Custo total (USD),Análises,Turnos de reanálise,Latência média (ms)');
  for (const p of report.byPhysician) {
    lines.push(
      [
        `"${(p.name ?? '—').replace(/"/g, '""')}"`,
        p.email,
        p.totalCost,
        p.analysesCount,
        p.reanalysisTurns,
        p.avgLatencyMs,
      ].join(','),
    );
  }
  lines.push('');
  lines.push('Custo por modelo');
  lines.push('Modelo,Custo total (USD),Nº de análises,Latência média (ms)');
  for (const m of report.byModel) {
    lines.push([m.model, m.totalCost, m.count, m.avgLatencyMs].join(','));
  }
  lines.push('');
  lines.push(`Nota,"${report.disclaimer.replace(/"/g, '""')}"`);

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `custo-ia-copiloto-${report.period.days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatMs(ms: number): string {
  return `${ms.toLocaleString('pt-BR')} ms`;
}

const numericCell = 'text-right tabular-nums';

function CostPanel() {
  const [days, setDays] = useState(DEFAULT_COST_DAYS);
  const [projectedUsersInput, setProjectedUsersInput] = useState(String(DEFAULT_PROJECTED_USERS));
  // PI-02 — só dispara a query quando o valor digitado é um inteiro válido;
  // evita rajada de requests a cada tecla enquanto o médico ainda está
  // digitando (ex.: "1" → "10" → "100").
  const projectedUsers = /^\d+$/.test(projectedUsersInput) ? Number(projectedUsersInput) : null;

  const { data, isPending, error, refetch } = useAiCostReport(days, projectedUsers);
  const totalCost = data?.totals.totalCost ?? 0;

  const physicianColumns: DataTableColumn<CostByPhysician>[] = [
    {
      key: 'physician',
      header: 'Médico',
      cardLabel: null,
      cell: (p) => (
        <div className="min-w-0 text-left">
          <p className="truncate font-medium text-foreground">{p.name ?? '—'}</p>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{p.email}</p>
        </div>
      ),
    },
    { key: 'cost', header: 'Custo', className: numericCell, cell: (p) => formatCost(p.totalCost) },
    {
      key: 'share',
      header: 'Participação',
      hideOnMobile: true,
      cell: (p) => (
        <ShareMeter value={p.totalCost} total={totalCost} label={`${formatCost(p.totalCost)} de ${formatCost(totalCost)}`} />
      ),
    },
    { key: 'analyses', header: 'Análises', className: numericCell, cell: (p) => p.analysesCount },
    { key: 'turns', header: 'Turnos reanálise', className: numericCell, cell: (p) => p.reanalysisTurns },
    { key: 'latency', header: 'Latência média', className: numericCell, cell: (p) => formatMs(p.avgLatencyMs) },
  ];

  const modelColumns: DataTableColumn<CostByModel>[] = [
    {
      key: 'model',
      header: 'Modelo',
      cardLabel: null,
      cell: (m) => <span className="block text-left font-mono text-[0.8125rem] text-foreground">{m.model}</span>,
    },
    { key: 'cost', header: 'Custo', className: numericCell, cell: (m) => formatCost(m.totalCost) },
    {
      key: 'share',
      header: 'Participação',
      hideOnMobile: true,
      cell: (m) => (
        <ShareMeter value={m.totalCost} total={totalCost} label={`${formatCost(m.totalCost)} de ${formatCost(totalCost)}`} />
      ),
    },
    { key: 'count', header: 'Nº de análises', className: numericCell, cell: (m) => m.count },
    { key: 'latency', header: 'Latência média', className: numericCell, cell: (m) => formatMs(m.avgLatencyMs) },
  ];

  const byDay = data?.byDay ?? [];
  const peakDay = byDay.reduce<(typeof byDay)[number] | null>(
    (peak, d) => (peak === null || d.cost > peak.cost ? d : peak),
    null,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PeriodToggle options={[7, 30, 90]} value={days} onChange={setDays} />
          <div className="flex items-center gap-2">
            <Label htmlFor="cost-projected-users">Projeção para</Label>
            <Input
              id="cost-projected-users"
              type="number"
              min={1}
              inputMode="numeric"
              value={projectedUsersInput}
              onChange={(e) => setProjectedUsersInput(e.target.value)}
              aria-describedby="cost-projected-users-unit"
              className="h-7 w-20 text-[0.8125rem] tabular-nums md:text-[0.8125rem]"
            />
            <span id="cost-projected-users-unit" className="text-[0.8125rem] text-muted-foreground">
              usuários
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="max-sm:h-10"
          disabled={!data}
          onClick={() => data && downloadCostCsv(data)}
        >
          <DownloadSimple aria-hidden="true" />
          Exportar CSV
        </Button>
      </div>

      {error && (
        <LoadError
          title="Não foi possível carregar o custo de IA"
          message={error.message}
          onRetry={() => void refetch()}
        />
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Totais do período" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Custo total"
            value={data ? formatCost(data.totals.totalCost) : '—'}
            sub={data ? `${data.totals.interactionCount} análises · ${data.totals.encounterCount} casos` : null}
            loading={isPending}
            tone="highlight"
          />
          <Metric
            label="Custo médio por caso"
            value={data ? formatCost(data.totals.avgCostPerCase) : '—'}
            loading={isPending}
          />
          <Metric
            label="Custo médio por análise"
            value={data ? formatCost(data.totals.avgCostPerAnalysis) : '—'}
            loading={isPending}
          />
          <Metric
            label="Turnos médios por caso"
            value={data ? formatDecimal(data.totals.avgTurnsPerCase) : '—'}
            sub="reanálises inflam este número — ver Sprint 26"
            loading={isPending}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Custo por dia"
          description={
            peakDay ? `Pico em ${formatDay(peakDay.date)}: ${formatCost(peakDay.cost)}.` : undefined
          }
        />
        <div className="rounded-lg border border-border px-4 pt-4 pb-3">
          {isPending ? (
            <Skeleton className="h-[188px] w-full" />
          ) : byDay.length > 0 ? (
            <div className="flex flex-col gap-3">
              <ColumnChart
                data={byDay.map((d) => ({ key: d.date, label: formatDay(d.date), value: d.cost }))}
                formatValue={formatCost}
                formatTick={(v) => `$${v.toLocaleString('pt-BR')}`}
                figureLabel={`Custo diário de IA nos últimos ${days} dias${
                  peakDay ? `, com pico de ${formatCost(peakDay.cost)} em ${formatDay(peakDay.date)}` : ''
                }. Valores na tabela abaixo.`}
              />
              <Disclosure title="Ver como tabela" meta={`${byDay.length} dias`} className="border-t border-border pt-2">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-[0.8125rem]">
                    <caption className="sr-only">Custo de IA por dia</caption>
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th scope="col" className="py-1.5 pr-4 font-normal">Dia</th>
                        <th scope="col" className="py-1.5 text-right font-normal">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDay.map((d) => (
                        <tr key={d.date} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-4 tabular-nums">{formatDay(d.date)}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatCost(d.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Disclosure>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem interações de IA no período.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Projeção" description="Quanto custaria abrir o Copiloto para N usuários." />
        <div className="flex items-start gap-3 rounded-lg bg-tone-blue-bg px-4 py-4 text-tone-blue-ink sm:px-5">
          <CurrencyDollar className="mt-0.5 size-6 shrink-0 text-tone-blue" weight="duotone" aria-hidden="true" />
          {isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-48 bg-background/60" />
              <Skeleton className="h-3 w-64 bg-background/60" />
            </div>
          ) : data ? (
            <div className="flex flex-col gap-1">
              <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.02em]">
                {formatCost(data.projection.projectedMonthlyCost)}
                <span className="ml-1.5 text-sm font-normal opacity-85">/ mês</span>
              </p>
              <p className="text-[0.8125rem] opacity-90">
                {formatCost(data.projection.avgCostPerPhysicianPerMonth)} por médico ativo/mês ×{' '}
                {data.projection.projectedUsers} usuários
              </p>
            </div>
          ) : (
            <p className="text-sm opacity-90">Informe um número inteiro de usuários para projetar.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Custo por médico" count={data ? data.byPhysician.length : undefined} />
        <DataTable
          columns={physicianColumns}
          rows={data?.byPhysician ?? []}
          getRowId={(p) => p.physicianId}
          loading={isPending}
          loadingRows={3}
          ariaLabel="Custo de IA por médico"
          emptyTitle="Sem interações de IA no período."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Custo por modelo" count={data ? data.byModel.length : undefined} />
        <DataTable
          columns={modelColumns}
          rows={data?.byModel ?? []}
          getRowId={(m) => m.model}
          loading={isPending}
          loadingRows={2}
          ariaLabel="Custo de IA por modelo"
          emptyTitle="Sem interações de IA no período."
        />
      </section>

      {data && <p className="text-xs text-muted-foreground">{data.disclaimer}</p>}
    </div>
  );
}

/** Média com vírgula decimal (pt-BR); `null` = sem dados no período. */
function formatDecimal(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
