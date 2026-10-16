import { formatMs, formatUsd } from '../clinical/report';
import { percentile } from '../clinical/stats';
import type { IntakeCase } from './case.schema';
import {
  CHECK_KIND_LABELS,
  DATA_FIELDS,
  FIELD_LABELS,
  gradeFields,
  JUDGMENT_FIELDS,
  type FieldCheck,
  type GradedField,
} from './grading';
import type { StopReason } from './guard';
import {
  READING_OUTCOMES,
  VALID_READING_OUTCOMES,
  type ReadingOutcome,
  type ReadingRow,
  type RunMeta,
} from './records';

/** Meta da CC-104: p50 da primeira pergunta em até 8 s. */
export const FIRST_QUESTION_TARGET_MS = 8_000;

const VITAL_FIELDS: ReadonlySet<GradedField> = new Set(
  DATA_FIELDS.filter((field) => field !== 'sex' && field !== 'age'),
);
const JUDGMENT: ReadonlySet<GradedField> = new Set(JUDGMENT_FIELDS);

/** `errors` de `total` avaliados. */
export interface Tally {
  errors: number;
  total: number;
}

export interface Latency {
  p50: number | null;
  p90: number | null;
  n: number;
}

export interface RowFindings {
  caseId: string;
  rep: number;
  /** Só o que não bateu. */
  checks: FieldCheck[];
}

export interface ModelSummary {
  model: string;
  /** Leituras com desfecho (as que a rodada interrompeu antes de chamar ficam fora). */
  executed: number;
  outcomes: Record<ReadingOutcome, number>;
  valid: number;
  reading: Latency;
  firstQuestion: Latency;
  /** Leituras válidas acima do teto de produção: lá, iriam ao plano sem perguntas. */
  overProductionTimeout: number;
  retriedRows: number;
  data: { sex: Tally; age: Tally; vitalsCases: Tally; vitalsFields: Tally };
  judgment: { syndrome: Tally; instability: Tally; timeCritical: Tally };
  /** Soma das chamadas com preço; `unknownCalls` > 0 = parte do custo é desconhecida. */
  cost: { knownUsd: number; unknownCalls: number };
  findings: RowFindings[];
}

function latencyOf(values: number[]): Latency {
  return { p50: percentile(values, 0.5), p90: percentile(values, 0.9), n: values.length };
}

function tally(checks: FieldCheck[][], pick: (check: FieldCheck) => boolean): Tally {
  const relevant = checks.map((row) => row.filter(pick)).filter((row) => row.length > 0);
  return {
    errors: relevant.filter((row) => row.some((check) => check.kind !== 'ok')).length,
    total: relevant.length,
  };
}

function fieldTally(checks: FieldCheck[][], field: GradedField): Tally {
  return tally(checks, (check) => check.field === field);
}

function emptyOutcomes(): Record<ReadingOutcome, number> {
  return Object.fromEntries(READING_OUTCOMES.map((outcome) => [outcome, 0])) as Record<
    ReadingOutcome,
    number
  >;
}

export function summarizeModel(
  model: string,
  rows: readonly ReadingRow[],
  casesById: ReadonlyMap<string, IntakeCase>,
  productionTimeoutMs: number,
): ModelSummary {
  const executed = rows.filter((row) => row.model === model && row.outcome !== 'stopped');
  const outcomes = emptyOutcomes();
  for (const row of rows.filter((candidate) => candidate.model === model)) {
    outcomes[row.outcome]++;
  }

  const valid = executed.filter((row) => VALID_READING_OUTCOMES.has(row.outcome));
  const readingTimes = valid.flatMap((row) => (row.readingMs === null ? [] : [row.readingMs]));
  const firstQuestionTimes = valid.flatMap((row) =>
    row.firstQuestionMs === null ? [] : [row.firstQuestionMs],
  );

  const graded = valid.flatMap((row) => {
    const intakeCase = casesById.get(row.caseId);
    if (!intakeCase || !row.fields) return [];
    return [{ row, checks: gradeFields(row.fields, intakeCase.expected) }];
  });
  const checks = graded.map(({ checks: rowChecks }) => rowChecks);
  const vitalsFields = checks.flat().filter((check) => VITAL_FIELDS.has(check.field));

  const calls = executed.flatMap((row) => row.calls);
  return {
    model,
    executed: executed.length,
    outcomes,
    valid: valid.length,
    reading: latencyOf(readingTimes),
    firstQuestion: latencyOf(firstQuestionTimes),
    overProductionTimeout: readingTimes.filter((ms) => ms > productionTimeoutMs).length,
    retriedRows: executed.filter((row) => row.attempts > 1).length,
    data: {
      sex: fieldTally(checks, 'sex'),
      age: fieldTally(checks, 'age'),
      vitalsCases: tally(checks, (check) => VITAL_FIELDS.has(check.field)),
      vitalsFields: {
        errors: vitalsFields.filter((check) => check.kind !== 'ok').length,
        total: vitalsFields.length,
      },
    },
    judgment: {
      syndrome: fieldTally(checks, 'syndrome'),
      instability: fieldTally(checks, 'instability'),
      timeCritical: fieldTally(checks, 'timeCritical'),
    },
    cost: {
      knownUsd: calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0),
      unknownCalls: calls.filter((call) => call.costUsd === null).length,
    },
    findings: graded
      .map(({ row, checks: rowChecks }) => ({
        caseId: row.caseId,
        rep: row.rep,
        checks: rowChecks.filter((check) => check.kind !== 'ok'),
      }))
      .filter((finding) => finding.checks.length > 0),
  };
}

/**
 * Atende à CC-104: p50 da primeira pergunta na meta e nenhum erro de sexo ou
 * idade (o que tirou o Haiku em 12/10). Sinais vitais e julgamento ficam ao
 * lado, para a decisão humana.
 */
export function meetsTarget(summary: ModelSummary): boolean {
  return (
    summary.valid > 0 &&
    summary.firstQuestion.p50 !== null &&
    summary.firstQuestion.p50 <= FIRST_QUESTION_TARGET_MS &&
    summary.data.sex.errors === 0 &&
    summary.data.age.errors === 0
  );
}

export function summarizeRun(
  meta: RunMeta,
  rows: readonly ReadingRow[],
  casesById: ReadonlyMap<string, IntakeCase>,
): ModelSummary[] {
  return meta.models.map(({ ref }) =>
    summarizeModel(ref, rows, casesById, meta.settings.productionTimeoutMs),
  );
}

// ── Renderização ─────────────────────────────────────────────────────────

function formatTally({ errors, total }: Tally): string {
  return total === 0 ? '—' : `${errors}/${total}`;
}

function formatLatency({ p50, p90 }: Latency): string {
  return p50 === null ? '—' : `${formatMs(p50)} · ${formatMs(p90)}`;
}

function formatCost(summary: ModelSummary): { total: string; perReading: string } {
  const unknown = summary.cost.unknownCalls > 0;
  const total = unknown
    ? `${formatUsd(summary.cost.knownUsd)} + desconhecido`
    : formatUsd(summary.cost.knownUsd);
  // Por leitura feita, válida ou não: a que falhou também foi paga.
  const perReading =
    unknown || summary.executed === 0 ? '—' : formatUsd(summary.cost.knownUsd / summary.executed);
  return { total, perReading };
}

function describeStop(stop: StopReason): string {
  switch (stop.kind) {
    case 'budget':
      return `teto de gasto de ${formatUsd(stop.maxUsd)} atingido (somado: ${formatUsd(stop.spentUsd)})`;
    case 'usage_limit':
      return `limite de uso do provedor na chamada a \`${stop.model}\`: "${stop.detail}"`;
    case 'rate_limit':
      return `limite de taxa persistente em \`${stop.model}\` depois das novas tentativas`;
  }
}

const OUTCOME_LABELS: Record<ReadingOutcome, string> = {
  ask: 'perguntou',
  unstable: 'instável (sem perguntas)',
  complete: 'completo (sem perguntas)',
  invalid_output: 'saída inválida',
  refusal: 'recusa',
  truncated: 'truncada',
  provider_error: 'erro do provedor',
  timeout: 'passou do teto de tempo do harness',
  stopped: 'interrompida antes de chamar',
};

function describeCheck(check: FieldCheck): string {
  const kind = check.kind === 'ok' ? 'ok' : CHECK_KIND_LABELS[check.kind];
  return `${FIELD_LABELS[check.field]} ${kind} (gabarito ${check.expected}, leitura ${check.got})`;
}

function renderFindings(summary: ModelSummary): string[] {
  if (summary.findings.length === 0) return ['Nenhum erro de dado nem divergência de julgamento.'];
  return summary.findings.map((finding) => {
    const data = finding.checks.filter((check) => !JUDGMENT.has(check.field));
    const judgment = finding.checks.filter((check) => JUDGMENT.has(check.field));
    const parts = [
      ...(data.length > 0 ? [`**dado:** ${data.map(describeCheck).join('; ')}`] : []),
      ...(judgment.length > 0 ? [`julgamento: ${judgment.map(describeCheck).join('; ')}`] : []),
    ];
    return `- \`${finding.caseId}\` #${finding.rep} — ${parts.join(' · ')}`;
  });
}

function renderFailures(rows: readonly ReadingRow[]): string[] {
  const failed = rows.filter(
    (row) => !VALID_READING_OUTCOMES.has(row.outcome) && row.outcome !== 'stopped',
  );
  if (failed.length === 0) return ['Nenhuma.'];
  return failed.map((row) => {
    const lastError = row.calls.at(-1)?.errorType;
    const detail = [row.failure, lastError].filter(Boolean).join(', ');
    return `- \`${row.model}\` · \`${row.caseId}\` #${row.rep}: ${OUTCOME_LABELS[row.outcome]}${detail ? ` (${detail})` : ''} · ${row.attempts} tentativa(s)`;
  });
}

function renderQuestions(meta: RunMeta, rows: readonly ReadingRow[]): string[] {
  const asked = rows.filter((row) => row.questions.length > 0);
  if (asked.length === 0) return [];
  const lines = ['', '<details><summary>Perguntas que passaram pelo portão</summary>', ''];
  for (const caseId of meta.caseSet.caseIds) {
    const forCase = asked.filter((row) => row.caseId === caseId);
    if (forCase.length === 0) continue;
    lines.push(`**${caseId}**`, '');
    for (const row of forCase) {
      lines.push(`- \`${row.model}\` #${row.rep}: ${row.questions.join(' / ')}`);
    }
    lines.push('');
  }
  lines.push('</details>');
  return lines;
}

export function renderReport(
  meta: RunMeta,
  rows: readonly ReadingRow[],
  summaries: readonly ModelSummary[],
): string {
  const executed = rows.filter((row) => row.outcome !== 'stopped').length;
  const maskedCases = new Set(rows.filter((row) => row.piiDetected).map((row) => row.caseId));
  const routes = meta.models
    .map((route) => `\`${route.ref}\` (${route.provider} · ${route.model})`)
    .join(', ');
  const candidates = summaries.filter(meetsTarget).map((summary) => `\`${summary.model}\``);

  const lines = [
    `# Leitura do caso — ${meta.runId}`,
    '',
    ...(meta.stop ? [`> ⚠️ **Rodada interrompida:** ${describeStop(meta.stop)}.`, ''] : []),
    `- Início ${meta.startedAt}${meta.finishedAt ? ` · fim ${meta.finishedAt}` : ''} · commit ${meta.git.commit?.slice(0, 8) ?? '?'}${meta.git.dirty ? ' (com alterações locais)' : ''}`,
    `- Casos: conjunto \`${meta.caseSet.set}\` (gabarito ${meta.caseSet.version}), ${meta.caseSet.caseIds.length} caso(s)${meta.caseSet.selector ? ` (\`--cases ${meta.caseSet.selector}\`)` : ''} × ${meta.reps} repetição(ões)`,
    `- Modelos: ${routes}`,
    `- Esforço ${meta.settings.effort} · structured output ${meta.settings.structuredOutput ? 'ligado' : 'desligado'} · concorrência ${meta.concurrency}`,
    `- Leituras feitas: ${executed} de ${meta.plannedTasks} · gasto somado ${formatUsd(meta.spentUsd)} de um teto de ${formatUsd(meta.maxUsd)}`,
    ...(maskedCases.size > 0
      ? [
          `- ⚠️ A máscara de PII alterou o texto de ${maskedCases.size} caso(s) antes do envio (${[...maskedCases].join(', ')}): confira a anonimização.`,
        ]
      : []),
    '',
    '## Latência e erros de dado (CC-104)',
    '',
    `Latência sobre as leituras válidas. "1ª pergunta" só conta os casos em que o portão perguntou (n). Erros de dado: casos com o campo errado, omitido ou inventado / casos lidos. Meta: p50 da 1ª pergunta ≤ ${formatMs(FIRST_QUESTION_TARGET_MS)}.`,
    '',
    '| Modelo | Leituras válidas | Leitura pronta p50 · p90 | 1ª pergunta p50 · p90 (n) | Sexo | Idade | Sinais vitais: casos · campos | Custo por leitura | Meta |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map((summary) => {
      const cost = formatCost(summary);
      return `| \`${summary.model}\` | ${summary.valid}/${summary.executed} | ${formatLatency(summary.reading)} | ${formatLatency(summary.firstQuestion)} (${summary.firstQuestion.n}) | ${formatTally(summary.data.sex)} | ${formatTally(summary.data.age)} | ${formatTally(summary.data.vitalsCases)} · ${formatTally(summary.data.vitalsFields)} | ${cost.perReading} | ${meetsTarget(summary) ? '✓' : '✗'} |`;
    }),
    '',
    candidates.length > 0
      ? `Atendem à meta (p50 da 1ª pergunta ≤ ${formatMs(FIRST_QUESTION_TARGET_MS)} e nenhum erro de sexo ou idade): ${candidates.join(', ')}. Confira sinais vitais, julgamento e as perguntas antes de escolher o \`AI_INTAKE_MODEL\`.`
      : `Nenhum modelo atende à meta (p50 da 1ª pergunta ≤ ${formatMs(FIRST_QUESTION_TARGET_MS)} e nenhum erro de sexo ou idade).`,
    '',
    '## Julgamento e caminho',
    '',
    `Julgamento: divergências / casos com gabarito do campo. Caminho: o que o portão decidiu. "> ${formatMs(meta.settings.productionTimeoutMs)}": leituras válidas acima do teto de produção, que lá iriam ao plano sem perguntas.`,
    '',
    '| Modelo | Síndrome | Instabilidade | Tempo-crítico | Perguntou | Instável | Completo | Sem leitura | > teto | Refeitas | Custo total |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map((summary) => {
      const failed = summary.executed - summary.valid;
      return `| \`${summary.model}\` | ${formatTally(summary.judgment.syndrome)} | ${formatTally(summary.judgment.instability)} | ${formatTally(summary.judgment.timeCritical)} | ${summary.outcomes.ask} | ${summary.outcomes.unstable} | ${summary.outcomes.complete} | ${failed} | ${summary.overProductionTimeout} | ${summary.retriedRows} | ${formatCost(summary).total} |`;
    }),
    '',
    '## Erros por caso',
    '',
    'Errado: valor diferente. Omitido: o texto informa e a leitura deixou vazio. Inventado: o texto não informa e a leitura pôs um valor.',
  ];
  for (const summary of summaries) {
    lines.push('', `### \`${summary.model}\``, '', ...renderFindings(summary));
  }
  lines.push('', '## Leituras que não vieram', '', ...renderFailures(rows));
  lines.push(...renderQuestions(meta, rows));
  return `${lines.join('\n')}\n`;
}
