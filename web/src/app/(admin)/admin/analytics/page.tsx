'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartBar, ArrowRight, Warning } from '@phosphor-icons/react';

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

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [demoCase, setDemoCase] = useState('');

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Funil de produto</h1>
          <p className="text-sm text-muted-foreground">
            Loop de decisão como métrica nº 1 — agregados LGPD-safe (contagens, razões, durações).
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Caso-norte</label>
            <Input
              value={demoCase}
              onChange={(e) => setDemoCase(e.target.value)}
              placeholder="ex.: gripal"
              className="h-9 w-40"
            />
          </div>
          <div className="flex gap-1">
            {[7, 30].map((d) => (
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
