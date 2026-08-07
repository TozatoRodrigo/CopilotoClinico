'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { DEMO_CASE_PRESETS } from '@/lib/demo-case-presets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartBar, ArrowRight, Warning, DownloadSimple, CurrencyDollar } from '@phosphor-icons/react';

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

// PI-02 — espelha AiCostReport em src/modules/analytics/analytics.service.ts.
// Sem contrato compartilhado aqui de propósito: este endpoint segue o mesmo
// padrão local-only já usado por ProductFunnel acima nesta mesma página
// (analytics/funil não está em @contracts/clinical), diferente dos tipos
// clínicos centrais (Physician, EncounterSummary) que vivem lá.
interface CostByPhysician {
  physicianId: string;
  name: string | null;
  email: string;
  totalCost: number;
  analysesCount: number;
  reanalysisTurns: number;
  avgLatencyMs: number;
}

interface CostByModel {
  model: string;
  totalCost: number;
  count: number;
  avgLatencyMs: number;
}

interface CostByDay {
  date: string;
  cost: number;
}

interface AiCostReport {
  period: { days: number; since: string; generatedAt: string };
  totals: {
    totalCost: number;
    interactionCount: number;
    encounterCount: number;
    avgCostPerCase: number | null;
    avgCostPerAnalysis: number | null;
    avgTurnsPerCase: number | null;
  };
  byPhysician: CostByPhysician[];
  byModel: CostByModel[];
  byDay: CostByDay[];
  projection: {
    projectedUsers: number;
    avgCostPerPhysicianPerMonth: number | null;
    projectedMonthlyCost: number | null;
  };
  disclaimer: string;
}

const ABANDONMENT_ALERT_THRESHOLD = 0.3;

export default function AnalyticsPage() {
  const [tab, setTab] = useState<'funil' | 'custo'>('funil');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Funil de produto e custo de IA — agregados LGPD-safe (nenhum dado de paciente).
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'funil' | 'custo')}>
        <TabsList>
          <TabsTrigger value="funil">Funil de produto</TabsTrigger>
          <TabsTrigger value="custo">Custo de IA</TabsTrigger>
        </TabsList>
        <TabsContent value="funil" className="mt-6">
          <FunnelPanel />
        </TabsContent>
        <TabsContent value="custo" className="mt-6">
          <CostPanel />
        </TabsContent>
      </Tabs>
    </div>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          {/*
            S25-ANALYTICS-01 — demoCase vira Select (antes era input texto
            que disparava request a cada tecla). Casos conhecidos vêm de
            DEMO_CASE_PRESETS. Valor "_all" = sem filtro (todos os casos).
          */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Caso-norte</label>
            <Select
              value={demoCase || '_all'}
              onValueChange={(v) => {
                const next = v === '_all' ? '' : v;
                setDemoCase(next);
                syncUrl(days, next);
              }}
            >
              <SelectTrigger className="h-9 w-44">
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
          <div className="flex gap-1">
            {[7, 30].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'outline'}
                onClick={() => {
                  setDays(d);
                  syncUrl(d, demoCase);
                }}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
            <span className="text-destructive">
              Não foi possível carregar o funil. {error.message}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Decision loop — the #1 metric */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Loop de decisão
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric
            label="% perguntas blocker respondidas"
            value={dl ? pct(dl.blockerAnswerRate) : null}
            sub={dl ? `${dl.blockerQuestionsAnswered}/${dl.blockerQuestionsEmitted}` : null}
            loading={isPending}
            primary
          />
          <Metric
            label="Turnos médios até conduta"
            value={dl ? (dl.avgTurnsToConduta === null ? '—' : String(dl.avgTurnsToConduta)) : null}
            sub={dl ? `${dl.reachedConduta} condutas fechadas` : null}
            loading={isPending}
          />
          <Metric
            label="Taxa de abandono do loop"
            value={dl ? pct(dl.abandonmentRate) : null}
            sub={dl ? `${dl.abandoned}/${dl.encountersWithBlockers} atendimentos` : null}
            loading={isPending}
            danger={abandonmentHigh}
          />
          <Metric
            label="Documentos confirmados"
            value={dl ? String(dl.confirmedDocuments) : null}
            sub={dl ? `${dl.analysesStarted} análises iniciadas` : null}
            loading={isPending}
          />
        </div>
        {abandonmentHigh && (
          <div className="flex items-center gap-2 rounded-lg border border-clinical-amber/40 bg-clinical-amber-bg px-3 py-2 text-sm text-clinical-amber-foreground">
            <Warning className="size-4" />
            Abandono acima de {pct(ABANDONMENT_ALERT_THRESHOLD)} — sinal de fricção na UI do copiloto.
          </div>
        )}
      </section>

      {/* Activation funnel */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ativação
        </h2>
        <Card>
          <CardContent className="py-4">
            {isPending ? (
              <Skeleton className="h-16 w-full rounded" />
            ) : act ? (
              <ActivationSteps steps={[
                { label: 'Cadastro', value: act.registered },
                { label: '1º atendimento', value: act.withEncounter },
                { label: '1ª análise', value: act.withAnalysis },
                { label: '1ª confirmação', value: act.withConfirmation },
              ]} />
            ) : (
              <ChartBar className="size-8 text-muted-foreground" weight="duotone" />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// PI-02 — formata em BRL porque é assim que a resposta vai para os sócios
// (o custo em si é medido em USD pelo provedor de IA, mas exibir a moeda de
// referência do negócio evita um passo de conversão manual toda vez que
// alguém olha o painel). O disclaimer deixa claro que é estimativa.
function formatCost(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
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

function CostPanel() {
  const [days, setDays] = useState(30);
  const [projectedUsersInput, setProjectedUsersInput] = useState('100');
  // PI-02 — só dispara a query quando o valor digitado é um inteiro válido;
  // evita rajada de requests a cada tecla enquanto o médico ainda está
  // digitando (ex.: "1" → "10" → "100").
  const projectedUsers = /^\d+$/.test(projectedUsersInput) ? Number(projectedUsersInput) : null;

  const { data, isPending, error, refetch } = useQuery<AiCostReport, ApiError>({
    queryKey: ['ai-cost-report', days, projectedUsers],
    queryFn: () =>
      apiClient.get<AiCostReport>('/analytics/cost', {
        days: String(days),
        ...(projectedUsers ? { projectedUsers: String(projectedUsers) } : {}),
      }),
    enabled: projectedUsers !== null,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'outline'}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cost-projected-users" className="text-xs text-muted-foreground">
              Projeção para N usuários
            </Label>
            <Input
              id="cost-projected-users"
              type="number"
              min={1}
              inputMode="numeric"
              value={projectedUsersInput}
              onChange={(e) => setProjectedUsersInput(e.target.value)}
              className="h-9 w-28"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={() => data && downloadCostCsv(data)}
        >
          <DownloadSimple className="mr-1.5 size-4" />
          Exportar CSV
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
            <span className="text-destructive">
              Não foi possível carregar o custo de IA. {error.message}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Totais do período
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric
            label="Custo total"
            value={data ? formatCost(data.totals.totalCost) : null}
            sub={data ? `${data.totals.interactionCount} análises · ${data.totals.encounterCount} casos` : null}
            loading={isPending}
            primary
          />
          <Metric
            label="Custo médio por caso"
            value={data ? formatCost(data.totals.avgCostPerCase) : null}
            sub={null}
            loading={isPending}
          />
          <Metric
            label="Custo médio por análise"
            value={data ? formatCost(data.totals.avgCostPerAnalysis) : null}
            sub={null}
            loading={isPending}
          />
          <Metric
            label="Turnos médios por caso"
            value={data ? (data.totals.avgTurnsPerCase === null ? '—' : String(data.totals.avgTurnsPerCase)) : null}
            sub="reanálises inflam este número — ver Sprint 26"
            loading={isPending}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Projeção — quanto custaria abrir para N usuários
        </h2>
        <Card className="border-clinical-teal/40 bg-clinical-teal-tint/40">
          <CardContent className="flex flex-wrap items-center gap-6 py-4">
            <CurrencyDollar className="size-8 shrink-0 text-clinical-teal-deep" weight="duotone" />
            {isPending ? (
              <Skeleton className="h-10 w-56 rounded" />
            ) : data ? (
              <div>
                <p className="font-display text-2xl tracking-tight text-clinical-teal-deep">
                  {formatCost(data.projection.projectedMonthlyCost)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ mês</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCost(data.projection.avgCostPerPhysicianPerMonth)} por médico ativo/mês ×{' '}
                  {data.projection.projectedUsers} usuários
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Custo por médico
        </h2>
        <Card>
          <CardContent className="p-0">
            {isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : data && data.byPhysician.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-clinical-line text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Médico</th>
                      <th className="px-4 py-2 font-medium">Custo</th>
                      <th className="px-4 py-2 font-medium">Análises</th>
                      <th className="px-4 py-2 font-medium">Turnos reanálise</th>
                      <th className="px-4 py-2 font-medium">Latência média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPhysician.map((p) => (
                      <tr key={p.physicianId} className="border-b border-clinical-line last:border-0">
                        <td className="px-4 py-2">
                          <p className="font-medium text-foreground">{p.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        </td>
                        <td className="px-4 py-2 font-mono">{formatCost(p.totalCost)}</td>
                        <td className="px-4 py-2">{p.analysesCount}</td>
                        <td className="px-4 py-2">{p.reanalysisTurns}</td>
                        <td className="px-4 py-2">{p.avgLatencyMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Sem interações de IA no período.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Custo por modelo
        </h2>
        <Card>
          <CardContent className="p-0">
            {isPending ? (
              <Skeleton className="m-4 h-16 w-full rounded" />
            ) : data && data.byModel.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-clinical-line text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Modelo</th>
                      <th className="px-4 py-2 font-medium">Custo</th>
                      <th className="px-4 py-2 font-medium">Nº de análises</th>
                      <th className="px-4 py-2 font-medium">Latência média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((m) => (
                      <tr key={m.model} className="border-b border-clinical-line last:border-0">
                        <td className="px-4 py-2 font-mono">{m.model}</td>
                        <td className="px-4 py-2 font-mono">{formatCost(m.totalCost)}</td>
                        <td className="px-4 py-2">{m.count}</td>
                        <td className="px-4 py-2">{m.avgLatencyMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Sem interações de IA no período.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {data && (
        <p className="text-xs italic text-muted-foreground">{data.disclaimer}</p>
      )}
    </div>
  );
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Metric({
  label,
  value,
  sub,
  loading,
  primary,
  danger,
}: {
  label: string;
  value: string | null;
  sub: string | null;
  loading: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className={danger ? 'border-clinical-amber/40' : undefined}>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-16 rounded" />
        ) : (
          <p
            className={
              'font-display text-2xl tracking-tight ' +
              (danger ? 'text-clinical-amber-foreground' : primary ? 'text-clinical-teal-deep' : 'text-foreground')
            }
          >
            {value}
          </p>
        )}
        {sub && !loading && <p className="text-xs text-muted-foreground">{sub}</p>}
        {primary && !loading && (
          <Badge variant="secondary" className="mt-1">
            métrica nº 1
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function ActivationSteps({ steps }: { steps: { label: string; value: number }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div className="rounded-lg border border-clinical-line bg-card px-3 py-2 text-center">
            <p className="font-display text-xl tracking-tight text-foreground">{step.value}</p>
            <p className="text-xs text-muted-foreground">{step.label}</p>
          </div>
          {i < steps.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}
