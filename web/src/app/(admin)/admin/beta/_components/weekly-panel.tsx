'use client';

import { useState, type ReactNode } from 'react';
import { CalendarDot, CaretLeft, CaretRight, ClipboardText } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { BetaActivationCounts } from '@contracts/beta';
import type {
  BetaAnalysesBucket,
  BetaWeeklyComparison,
  BetaWeeklyOptional,
  BetaWeeklyReport,
} from '@contracts/beta-weekly';
import { useBetaWeekly } from '@/lib/beta-queries';
import { copyText } from '@/lib/clipboard';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { SectionHeader } from '@/components/layout/page-header';
import { LoadError } from '../../_components/load-error';
import { Metric } from '../../_components/metric';
import { formatLatency, formatUsd } from '../../_lib/ai-calls';
import { formatRate } from './beta-labels';

// CC-705 — tipos do contrato (src/shared/contracts/beta-weekly.ts), só como
// tipo: a imagem do web não leva o código da API, então os rótulos ficam aqui
// e o `Record` do tipo do contrato garante que nenhuma faixa falta.

/** Ativo com 0 análise é quem só respondeu pergunta (a análise falhou ou não saiu). */
const BUCKET_LABELS: Record<BetaAnalysesBucket, string> = {
  '0': 'só respondeu pergunta',
  '1': '1 análise',
  '2-4': '2 a 4',
  '5-9': '5 a 9',
  '10+': '10 ou mais',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-10-12` + 7 → `2026-10-19`, sem passar por fuso. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `2026-10-12` → `12/10`; com `withYear`, `12/10/2026`. */
function shortDate(date: string, withYear = false): string {
  const [year, month, day] = date.split('-');
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

const brasiliaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Instante no relógio de Brasília, como na ata: "sex 16/10 às 13:00". */
function localMoment(iso: string): string {
  const parts = Object.fromEntries(
    brasiliaParts
      .formatToParts(new Date(iso))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const weekday = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  ).getUTCDay();
  return `${WEEKDAYS[weekday]} ${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "anterior: 9 (+3)". Sem cor: subir nem sempre é bom (feedback negativo). */
function previousCount({ current, previous }: BetaWeeklyComparison<number>): string {
  const diff = current - previous;
  const signed =
    diff === 0 ? 'igual' : `${diff > 0 ? '+' : '-'}${Math.abs(diff).toLocaleString('pt-BR')}`;
  return `anterior: ${previous.toLocaleString('pt-BR')} (${signed})`;
}

function activationSummary(counts: BetaActivationCounts): string {
  if (counts.registered === 0) return 'nenhum cadastro';
  if (counts.eligible === 0) return `${counts.registered} sem 24 h completas`;
  return `${formatRate(counts.rate)} (${counts.activated24h} de ${counts.eligible})`;
}

function belowTarget(rate: number | null, target: number): boolean {
  return rate !== null && rate < target;
}

/** Número que a história de origem ainda não grava; o caso `available` já está pronto. */
function OptionalMetric<T>({
  label,
  metric,
  format,
  loading,
}: {
  label: string;
  metric: BetaWeeklyOptional<T> | undefined;
  format: (value: T) => string;
  loading: boolean;
}) {
  if (!metric || metric.available) {
    return (
      <Metric
        label={label}
        value={metric ? format(metric.current) : '—'}
        sub={metric ? `anterior: ${format(metric.previous)}` : undefined}
        loading={loading}
      />
    );
  }
  return (
    <Metric
      label={label}
      value={<span className="text-muted-foreground">sem dado</span>}
      sub={`${metric.source}: ${metric.reason}`}
      loading={loading}
    />
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <SectionHeader as="h3" title={<span id={id}>{title}</span>} />
      {children}
    </section>
  );
}

async function copySummary(markdown: string) {
  if (await copyText(markdown)) {
    toast.success('Resumo copiado. Cole na ata da reunião no Meeting Tracker.');
  } else {
    toast.error('Não foi possível copiar. Abra o resumo abaixo e copie manualmente.');
  }
}

function periodDescription(report: BetaWeeklyReport): string {
  const { current, previous, inProgress } = report.period;
  if (inProgress) {
    return `Semana em andamento: números até ${localMoment(current.to)} (horário de Brasília), contra a semana de ${shortDate(previous.weekStart)} a ${shortDate(previous.weekEnd)} até o mesmo dia e hora.`;
  }
  return `Semana inteira, de segunda a domingo no horário de Brasília, contra a de ${shortDate(previous.weekStart)} a ${shortDate(previous.weekEnd)}.`;
}

/**
 * CC-705 — os números do beta para a reunião de sexta (CC-706): uso, qualidade,
 * custo e latência, lacunas e ativação, com a semana anterior ao lado, e o
 * resumo em markdown para a ata. Médicos só agregados; nada do caso.
 */
export function WeeklyPanel() {
  const [week, setWeek] = useState<string | null>(null);
  const { data: report, isPending, error, refetch } = useBetaWeekly(week);
  const loading = isPending;

  const usage = report?.usage;
  const feedback = report?.feedback;
  const aiCost = report?.aiCost;
  const activation = report?.activation;
  const target = activation?.target ?? 0.7;

  const title = report
    ? `Semana de ${shortDate(report.period.current.weekStart)} a ${shortDate(report.period.current.weekEnd, true)}`
    : 'Semana';

  const navigation = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!report}
        onClick={() => report && setWeek(shiftDate(report.period.current.weekStart, -7))}
      >
        <CaretLeft aria-hidden="true" />
        Semana anterior
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!report || report.period.inProgress}
        onClick={() => report && setWeek(shiftDate(report.period.current.weekStart, 7))}
      >
        Próxima
        <CaretRight aria-hidden="true" />
      </Button>
      {week !== null && (
        <Button variant="ghost" size="sm" onClick={() => setWeek(null)}>
          <CalendarDot aria-hidden="true" />
          Semana atual
        </Button>
      )}
      <Button
        size="sm"
        disabled={!report}
        onClick={() => report && void copySummary(report.markdown)}
      >
        <ClipboardText aria-hidden="true" />
        Copiar resumo para a ata
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        title={title}
        description={
          report
            ? periodDescription(report)
            : 'Segunda a domingo no horário de Brasília, com a semana anterior ao lado.'
        }
        action={navigation}
        className="[&>div:first-child]:flex-wrap"
      />

      {error ? (
        <LoadError
          title="Não foi possível carregar a semana"
          message={error.message}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <Section id="beta-week-usage" title="Uso">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Médicos ativos"
                value={usage ? usage.current.activePhysicians : '—'}
                sub={
                  usage
                    ? previousCount({
                        current: usage.current.activePhysicians,
                        previous: usage.previous.activePhysicians,
                      })
                    : undefined
                }
                tone="highlight"
                loading={loading}
              />
              <Metric
                label="Análises concluídas"
                value={usage ? usage.current.analyses : '—'}
                sub={
                  usage
                    ? previousCount({
                        current: usage.current.analyses,
                        previous: usage.previous.analyses,
                      }) +
                      (usage.current.demoAnalyses > 0
                        ? ` · ${usage.current.demoAnalyses} do caso de exemplo, fora da conta`
                        : '')
                    : undefined
                }
                loading={loading}
              />
              <Metric
                label="Análises por médico ativo"
                value={usage ? formatNumber(usage.current.analysesPerPhysician.mean) : '—'}
                sub={
                  usage
                    ? `mediana ${formatNumber(usage.current.analysesPerPhysician.median)} · anterior: ${formatNumber(usage.previous.analysesPerPhysician.mean)}`
                    : undefined
                }
                loading={loading}
              />
              <Metric
                label="Feedback negativo por 100 análises"
                value={feedback ? formatNumber(feedback.current.negativePer100Analyses) : '—'}
                sub={
                  feedback
                    ? `${feedback.current.negative} ${feedback.current.negative === 1 ? 'reporte' : 'reportes'} · anterior: ${formatNumber(feedback.previous.negativePer100Analyses)} · "foi útil": ${feedback.current.helpful}`
                    : undefined
                }
                loading={loading}
              />
            </div>
            {usage && usage.current.activePhysicians > 0 && (
              <ul
                aria-label="Médicos ativos por número de análises"
                className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground"
              >
                {usage.current.distribution
                  .filter((entry) => entry.physicians > 0)
                  .map((entry) => (
                    <li key={entry.bucket} className="tabular-nums">
                      {BUCKET_LABELS[entry.bucket]}:{' '}
                      <span className="font-medium text-foreground">{entry.physicians}</span>{' '}
                      {entry.physicians === 1 ? 'médico' : 'médicos'}
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          <Section id="beta-week-ai" title="Custo e latência por análise">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Custo por análise"
                value={aiCost ? formatUsd(aiCost.current.avgCostUsd) : '—'}
                sub={aiCost ? `anterior: ${formatUsd(aiCost.previous.avgCostUsd)}` : undefined}
                loading={loading}
              />
              <Metric
                label="Latência p50"
                value={aiCost ? formatLatency(aiCost.current.latency.p50Ms) : '—'}
                sub={
                  aiCost ? `anterior: ${formatLatency(aiCost.previous.latency.p50Ms)}` : undefined
                }
                loading={loading}
              />
              <Metric
                label="Latência p95"
                value={aiCost ? formatLatency(aiCost.current.latency.p95Ms) : '—'}
                sub={
                  aiCost ? `anterior: ${formatLatency(aiCost.previous.latency.p95Ms)}` : undefined
                }
                loading={loading}
              />
              <Metric
                label="Custo total"
                value={aiCost ? formatUsd(aiCost.current.totalCostUsd) : '—'}
                sub={
                  aiCost
                    ? `${aiCost.current.count} ${aiCost.current.count === 1 ? 'análise' : 'análises'} em ai_calls`
                    : undefined
                }
                loading={loading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              De ai_calls: requisições com a etapa de decisão, inclusive caso de exemplo e testes da
              equipe. A latência soma as chamadas de IA da análise. Custo estimado pelos tokens, não
              o faturado.
            </p>
          </Section>

          <Section id="beta-week-pending" title="Cartões, ferramentas e mentoria">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <OptionalMetric
                label="Análises com cartão aplicado"
                metric={report?.cardUsage}
                format={(value) =>
                  `${formatRate(value.rate)} (${value.withCard} de ${value.analyses})`
                }
                loading={loading}
              />
              <OptionalMetric
                label="Uso de ferramentas"
                metric={report?.toolUsage}
                format={(value) => `${value.uses} usos · ${value.physicians} médicos`}
                loading={loading}
              />
              <OptionalMetric
                label="Pedidos de mentoria"
                metric={report?.mentorship}
                format={(value) => String(value.requests)}
                loading={loading}
              />
            </div>
          </Section>

          <Section id="beta-week-gaps" title='Lacunas: "não encontrei o que precisava"'>
            {report && (
              <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
                {report.knowledgeGaps.total.current}{' '}
                {report.knowledgeGaps.total.current === 1 ? 'lacuna' : 'lacunas'} na semana ·{' '}
                {previousCount(report.knowledgeGaps.total)}
              </p>
            )}
            {report && report.knowledgeGaps.top.length > 0 ? (
              <ol
                aria-label="Lacunas mais frequentes"
                className="divide-y divide-border border-y border-border"
              >
                {report.knowledgeGaps.top.map((gap) => (
                  <li
                    key={gap.syndrome ?? '__sem_sindrome'}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 font-medium text-foreground">
                      {gap.syndrome ?? 'sem síndrome registrada'}
                    </span>
                    <span className="text-foreground tabular-nums">
                      {gap.current} {gap.current === 1 ? 'lacuna' : 'lacunas'}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      anterior: {gap.previous}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              report && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma lacuna registrada na semana.
                </p>
              )
            )}
          </Section>

          <Section id="beta-week-activation" title="Ativação em 24 h dos cadastros da semana">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Metric
                label="Ativação (qualquer caso)"
                value={formatRate(activation?.current.overall.rate ?? null)}
                sub={
                  activation
                    ? `${activation.current.overall.activated24h} de ${activation.current.overall.eligible} · meta ${formatRate(target)} · anterior: ${activationSummary(activation.previous.overall)}`
                    : undefined
                }
                tone={
                  belowTarget(activation?.current.overall.rate ?? null, target)
                    ? 'warning'
                    : 'default'
                }
                loading={loading}
              />
              <Metric
                label="Com caso real"
                value={formatRate(activation?.current.overall.realCaseRate ?? null)}
                sub="fora o caso de exemplo"
                loading={loading}
              />
              <Metric
                label="Cadastros na semana"
                value={activation?.current.overall.registered ?? '—'}
                sub={
                  activation
                    ? `${activation.current.overall.eligible} com 24 h completas`
                    : undefined
                }
                loading={loading}
              />
            </div>
            {activation && activation.current.byBatch.length > 0 && (
              <ul
                aria-label="Ativação por lote"
                className="divide-y divide-border border-y border-border"
              >
                {activation.current.byBatch.map((batch) => {
                  const previous = activation.previous.byBatch.find(
                    (candidate) => candidate.batchLabel === batch.batchLabel,
                  );
                  return (
                    <li
                      key={batch.batchLabel ?? '__sem_convite'}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 font-medium text-foreground">
                        {batch.batchLabel ?? 'Sem convite'}
                      </span>
                      <span className="text-foreground tabular-nums">
                        {activationSummary(batch)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        anterior: {previous ? activationSummary(previous) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {report && (
            <Disclosure title="Resumo para a ata (markdown)" meta="o mesmo que o botão copia">
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
                {report.markdown}
              </pre>
            </Disclosure>
          )}

          <p className="text-xs text-muted-foreground">
            Médico ativo: análise concluída ou pergunta respondida em caso real (papel médico; caso
            de exemplo e conta de admin ficam fora). Os eventos do Umami (ferramenta aberta, cartão
            aberto, pergunta rápida) ficam no Umami, não no banco, e não entram aqui.
          </p>
        </>
      )}
    </div>
  );
}
