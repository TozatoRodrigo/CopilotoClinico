import {
  BETA_WEEK_TIME_ZONE,
  type BetaAnalysesBucket,
  type BetaWeeklyActivationWeek,
  type BetaWeeklyComparison,
  type BetaWeeklyOptional,
  type BetaWeeklyReport,
} from '../../shared/contracts/beta-weekly';
import type { BetaActivationCounts } from '../../shared/contracts/beta';

type WeeklyData = Omit<BetaWeeklyReport, 'markdown'>;

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Ativo com 0 análise é quem só respondeu pergunta (a análise falhou ou não saiu). */
const BUCKET_LABELS: Record<BetaAnalysesBucket, string> = {
  '0': 'só respondeu pergunta',
  '1': '1 análise',
  '2-4': '2 a 4',
  '5-9': '5 a 9',
  '10+': '10 ou mais',
};

const localMomentFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BETA_WEEK_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function integer(value: number): string {
  return value.toLocaleString('pt-BR');
}

function decimal(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function delta(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return 'igual';
  return `${diff > 0 ? '+' : '-'}${integer(Math.abs(diff))}`;
}

/** Abaixo de US$ 0,10, até 4 casas (custo por análise é fração de dólar). */
function usd(value: number | null): string {
  if (value === null) return '—';
  return value
    .toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: Math.abs(value) < 0.1 ? 4 : 2,
    })
    .replace(/ /g, ' ');
}

function latency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${integer(ms)} ms`;
  return `${decimal(Math.round(ms / 100) / 10)} s`;
}

/** `2026-10-12` → `12/10`; com `withYear`, `12/10/2026`. */
function shortDate(date: string, withYear = false): string {
  const [year, month, day] = date.split('-');
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

/** Instante no relógio de Brasília: `qui 15/10 às 14:30`. */
function localMoment(iso: string): string {
  const instant = new Date(iso);
  const parts = Object.fromEntries(
    localMomentFormat
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const weekday = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  ).getUTCDay();
  return `${WEEKDAYS[weekday]} ${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

/** `12 (anterior: 9, +3)`. */
function countLine(values: BetaWeeklyComparison<number>): string {
  return `${integer(values.current)} (anterior: ${integer(values.previous)}, ${delta(values.current, values.previous)})`;
}

function unavailableLine<T>(
  label: string,
  metric: BetaWeeklyOptional<T>,
  format: (value: T) => string,
): string {
  if (!metric.available) return `- ${label}: sem dado (${metric.source}: ${metric.reason})`;
  return `- ${label}: ${format(metric.current)} (anterior: ${format(metric.previous)})`;
}

function activationCounts(counts: BetaActivationCounts): string {
  if (counts.registered === 0) return 'nenhum cadastro';
  if (counts.eligible === 0) {
    return `${integer(counts.registered)} ${counts.registered === 1 ? 'cadastro' : 'cadastros'}, nenhum com 24 h completas`;
  }
  return `${percent(counts.rate)} (${integer(counts.activated24h)} de ${integer(counts.eligible)}; caso real ${percent(counts.realCaseRate)})`;
}

function activationLines(
  activation: BetaWeeklyComparison<BetaWeeklyActivationWeek> & { target: number },
): string[] {
  const lines = [
    `- Geral: ${activationCounts(activation.current.overall)} · anterior: ${activationCounts(activation.previous.overall)}`,
  ];
  for (const batch of activation.current.byBatch) {
    const previous = activation.previous.byBatch.find(
      (candidate) => candidate.batchLabel === batch.batchLabel,
    );
    const label = batch.batchLabel ?? 'Sem convite';
    lines.push(
      `- ${label}: ${activationCounts(batch)}${previous ? ` · anterior: ${activationCounts(previous)}` : ''}`,
    );
  }
  const pending = activation.current.overall.registered - activation.current.overall.eligible;
  if (pending > 0) {
    lines.push(
      `- ${integer(pending)} ${pending === 1 ? 'cadastro ainda não completou' : 'cadastros ainda não completaram'} 24 h e ${pending === 1 ? 'fica' : 'ficam'} fora da taxa`,
    );
  }
  return lines;
}

/**
 * CC-705/CC-706 — resumo da semana em markdown, para colar na ata da reunião
 * de sexta no Meeting Tracker do ClickUp. Segue a pauta (15 min de números,
 * 30 de decisões, 15 de próximos passos) e deixa as duas últimas seções para
 * preencher na reunião. Sem tabela: a colagem no ClickUp não as preserva bem.
 */
export function renderBetaWeeklyMarkdown(report: WeeklyData): string {
  const { period, usage, feedback, aiCost, knowledgeGaps, activation } = report;
  const current = usage.current;
  const previous = usage.previous;

  const lines: string[] = [
    `## Beta · semana de ${shortDate(period.current.weekStart)} a ${shortDate(period.current.weekEnd, true)}`,
    '',
  ];

  if (period.inProgress) {
    lines.push(
      `> Semana em andamento: números até ${localMoment(period.current.to)} (horário de Brasília). A semana anterior (${shortDate(period.previous.weekStart)} a ${shortDate(period.previous.weekEnd)}) entra até o mesmo dia e hora.`,
      '',
    );
  } else {
    lines.push(
      `> Comparação com a semana de ${shortDate(period.previous.weekStart)} a ${shortDate(period.previous.weekEnd)}.`,
      '',
    );
  }

  lines.push('### 1. Números (15 min)', '', '#### Uso', '');
  lines.push(
    `- Médicos ativos: ${countLine({ current: current.activePhysicians, previous: previous.activePhysicians })}`,
    `- Análises concluídas: ${countLine({ current: current.analyses, previous: previous.analyses })}` +
      (current.demoAnalyses > 0
        ? ` · ${integer(current.demoAnalyses)} do caso de exemplo, fora da conta`
        : ''),
    `- Análises por médico ativo: média ${decimal(current.analysesPerPhysician.mean)} · mediana ${decimal(current.analysesPerPhysician.median)} (anterior: média ${decimal(previous.analysesPerPhysician.mean)} · mediana ${decimal(previous.analysesPerPhysician.median)})`,
  );
  if (current.activePhysicians > 0) {
    const distribution = current.distribution
      .filter((entry) => entry.physicians > 0)
      .map((entry) => `${BUCKET_LABELS[entry.bucket]}: ${integer(entry.physicians)}`)
      .join(' · ');
    lines.push(`- Médicos por número de análises: ${distribution}`);
  }

  lines.push('', '#### Qualidade', '');
  lines.push(
    `- Feedback negativo: ${decimal(feedback.current.negativePer100Analyses)} por 100 análises (${integer(feedback.current.negative)} ${feedback.current.negative === 1 ? 'reporte' : 'reportes'}) · anterior: ${decimal(feedback.previous.negativePer100Analyses)} (${integer(feedback.previous.negative)} ${feedback.previous.negative === 1 ? 'reporte' : 'reportes'})`,
    `- "Foi útil": ${countLine({ current: feedback.current.helpful, previous: feedback.previous.helpful })}`,
    unavailableLine(
      '% de análises com cartão aplicado',
      report.cardUsage,
      (value) =>
        `${percent(value.rate)} (${integer(value.withCard)} de ${integer(value.analyses)})`,
    ),
  );

  lines.push('', '#### IA', '');
  lines.push(
    `- Custo por análise: ${usd(aiCost.current.avgCostUsd)} (anterior: ${usd(aiCost.previous.avgCostUsd)}) · total ${usd(aiCost.current.totalCostUsd)} em ${integer(aiCost.current.count)} ${aiCost.current.count === 1 ? 'análise' : 'análises'}`,
    `- Latência por análise: p50 ${latency(aiCost.current.latency.p50Ms)} · p95 ${latency(aiCost.current.latency.p95Ms)} (anterior: p50 ${latency(aiCost.previous.latency.p50Ms)} · p95 ${latency(aiCost.previous.latency.p95Ms)})`,
  );

  lines.push('', '#### Ferramentas e mentoria', '');
  lines.push(
    unavailableLine(
      'Uso de ferramentas',
      report.toolUsage,
      (value) => `${integer(value.uses)} usos por ${integer(value.physicians)} médicos`,
    ),
    unavailableLine('Pedidos de mentoria', report.mentorship, (value) => integer(value.requests)),
  );

  lines.push('', '#### Lacunas ("não encontrei o que precisava")', '');
  lines.push(`- Total: ${countLine(knowledgeGaps.total)}`);
  knowledgeGaps.top.forEach((gap, index) => {
    lines.push(
      `${index + 1}. ${gap.syndrome ?? 'sem síndrome registrada'}: ${integer(gap.current)} (anterior: ${integer(gap.previous)})`,
    );
  });

  lines.push(
    '',
    `#### Ativação em 24 h (cadastros da semana · meta ${percent(activation.target)})`,
    '',
  );
  lines.push(...activationLines(activation));

  lines.push(
    '',
    '### 2. Decisões (30 min)',
    '',
    '- ',
    '',
    '### 3. Próximos passos (15 min)',
    '',
    '- [ ] ',
    '',
    `_Gerado pelo painel do beta (/admin/beta) em ${localMoment(report.generatedAt)}. Sem dado de paciente; médicos só agregados._`,
    '',
  );

  return lines.join('\n');
}
