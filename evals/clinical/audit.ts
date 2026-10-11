import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { ClinicalCase } from './case.schema';
import { loadCaseSet } from './cases';
import {
  auditFlagsCritical,
  AuditVerdictSchema,
  buildAuditRequest,
  parseAuditVerdict,
  type AuditVerdict,
} from './graders/auditor';
import { AnthropicJudgeClient, isTransientJudgeError } from './graders/judge-clients';
import type { JudgeClient } from './graders/judge';
import { isGateCase, judgedCaseView } from './grading';
import { costUsd, judgeUsage } from './pricing';
import {
  GradeRowSchema,
  readJsonLines,
  ResultRowSchema,
  RUN_FILES,
  writeJsonLines,
  type GradeRow,
  type ResultRow,
} from './records';
import { DEFAULT_RETRY_POLICY, mapWithConcurrency, retryWhile } from './scheduling';
import { rateOf } from './stats';
import { formatRate, formatUsd } from './report';

/**
 * Calibra o auditor sem gabarito contra uma execução já julgada: o auditor
 * lê só o caso e a saída; a concordância com os erros críticos do gabarito diz
 * se ele pode vigiar, em produção, os casos que o gabarito não tem.
 *
 * Uso: tsx evals/clinical/audit.ts <runDir> [--concurrency 4] [--reuse]
 * `--reuse` não chama o modelo: relê audits.jsonl e refaz só a concordância
 * (ex.: depois de regravar as notas do gabarito).
 * Modelo: AUDITOR_MODEL (padrão claude-sonnet-5-5), credencial padrão do SDK.
 */

const AuditRowSchema = z.object({
  caseId: z.string(),
  rep: z.number().int(),
  verdict: AuditVerdictSchema.nullable(),
  error: z.string().nullable(),
  model: z.string(),
  costUsd: z.number().nullable(),
});

type AuditRow = z.infer<typeof AuditRowSchema>;

export const AUDIT_FILES = { rows: 'audits.jsonl', report: 'audit.md' } as const;

async function auditRow(
  client: JudgeClient,
  row: ResultRow,
  clinicalCase: ClinicalCase,
): Promise<AuditRow> {
  const base = { caseId: row.caseId, rep: row.rep, model: client.model };
  if (!row.output) return { ...base, verdict: null, error: 'sem resposta', costUsd: null };
  const request = buildAuditRequest(
    clinicalCase,
    { ...row.output, understanding: row.understanding },
    judgedCaseView(row, clinicalCase),
  );
  const { result } = await retryWhile(
    async () => {
      try {
        return { ok: true as const, response: await client.complete(request) };
      } catch (error) {
        return { ok: false as const, error, retryable: isTransientJudgeError(error) };
      }
    },
    (attempt) => !attempt.ok && attempt.retryable,
    DEFAULT_RETRY_POLICY,
  );
  if (!result.ok) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    return { ...base, verdict: null, error: message, costUsd: null };
  }
  const { response } = result;
  const cost = costUsd(
    response.model,
    judgeUsage(response.usage.inputTokens, response.usage.outputTokens),
  );
  try {
    return { ...base, verdict: parseAuditVerdict(response.content), error: null, costUsd: cost };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, verdict: null, error: `resposta fora do formato: ${message}`, costUsd: cost };
  }
}

export interface Agreement {
  /** Gabarito com erro crítico e auditor alertou. */
  truePositives: Array<{ caseId: string; gold: string[]; audit: string[] }>;
  /** Gabarito com erro crítico e auditor calado: o que ele deixaria passar em produção. */
  falseNegatives: Array<{ caseId: string; gold: string[] }>;
  /** Auditor alertou sem erro crítico no gabarito: alarme falso OU falha que o gabarito não cobra. */
  falsePositives: Array<{ caseId: string; audit: string[] }>;
  trueNegatives: number;
}

export function auditFindings(verdict: AuditVerdict): string[] {
  return [
    ...verdict.missedCannotMiss.map(
      (finding) => `hipótese esquecida: ${finding.item} — ${finding.why}`,
    ),
    ...verdict.dangerousNow.map((finding) => `perigosa agora: ${finding.item} — ${finding.why}`),
    ...verdict.delayedTimeCritical.map(
      (finding) => `tempo-dependente ausente/adiada: ${finding.item} — ${finding.why}`,
    ),
    ...(verdict.safeNextStep.pass
      ? []
      : [`próximo passo inseguro: ${verdict.safeNextStep.justification}`]),
  ];
}

/** Só linhas com resposta, gabarito completo e auditoria válida, nos casos do portão. */
export function measureAgreement(
  audits: AuditRow[],
  grades: GradeRow[],
  casesById: Map<string, ClinicalCase>,
): Agreement {
  const agreement: Agreement = {
    truePositives: [],
    falseNegatives: [],
    falsePositives: [],
    trueNegatives: 0,
  };
  for (const audit of audits) {
    const grade = grades.find((row) => row.caseId === audit.caseId && row.rep === audit.rep);
    if (!audit.verdict || !grade || grade.status !== 'ok' || !grade.criticalError.complete)
      continue;
    if (!isGateCase(casesById.get(audit.caseId))) continue;
    const flagged = auditFlagsCritical(audit.verdict);
    const gold = grade.criticalError.value;
    const findings = auditFindings(audit.verdict);
    if (gold && flagged)
      agreement.truePositives.push({
        caseId: audit.caseId,
        gold: grade.criticalError.reasons,
        audit: findings,
      });
    else if (gold)
      agreement.falseNegatives.push({ caseId: audit.caseId, gold: grade.criticalError.reasons });
    else if (flagged) agreement.falsePositives.push({ caseId: audit.caseId, audit: findings });
    else agreement.trueNegatives += 1;
  }
  return agreement;
}

function renderAgreement(runDir: string, audits: AuditRow[], agreement: Agreement): string {
  const tp = agreement.truePositives.length;
  const fn = agreement.falseNegatives.length;
  const fp = agreement.falsePositives.length;
  const tn = agreement.trueNegatives;
  const flags = (count: number, total: number) =>
    rateOf(Array.from({ length: total }, (_u, i) => i < count));
  const cost = audits.reduce((sum, audit) => sum + (audit.costUsd ?? 0), 0);
  const lines = [
    `# Auditor sem gabarito — calibração`,
    '',
    `Execução: ${runDir} · modelo ${audits[0]?.model ?? '—'} · ${audits.length} auditorias (${audits.filter((audit) => audit.error).length} com erro) · custo ${formatUsd(cost)}`,
    '',
    '| Medida | Valor |',
    '| --- | --- |',
    `| Sensibilidade (erros críticos do gabarito que o auditor alertou) | ${formatRate(flags(tp, tp + fn))} |`,
    `| Especificidade (casos limpos sem alerta) | ${formatRate(flags(tn, tn + fp))} |`,
    `| Alertas que coincidem com erro crítico do gabarito | ${formatRate(flags(tp, tp + fp))} |`,
    '',
    '## Erros críticos que o auditor deixou passar',
    '',
    ...agreement.falseNegatives.map((row) => `- **${row.caseId}**: ${row.gold.join('; ')}`),
    '',
    '## Alertas do auditor sem erro crítico no gabarito',
    '',
    'Alarme falso ou falha que o gabarito não cobra — revisar um a um.',
    '',
    ...agreement.falsePositives.map((row) => `- **${row.caseId}**: ${row.audit.join(' | ')}`),
    '',
    '## Concordâncias',
    '',
    ...agreement.truePositives.map(
      (row) =>
        `- **${row.caseId}** — gabarito: ${row.gold.join('; ')} · auditor: ${row.audit.join(' | ')}`,
    ),
    '',
  ];
  return lines.join('\n');
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      concurrency: { type: 'string', default: '4' },
      reuse: { type: 'boolean', default: false },
    },
  });
  const runDir = positionals[0];
  if (!runDir) {
    console.log('Uso: tsx evals/clinical/audit.ts <runDir> [--concurrency 4]');
    return 1;
  }
  const dir = resolve(runDir);
  const { cases } = loadCaseSet();
  const casesById = new Map(cases.map((clinicalCase) => [clinicalCase.id, clinicalCase]));
  const results = readJsonLines(join(dir, RUN_FILES.results), ResultRowSchema);
  const grades = readJsonLines(join(dir, RUN_FILES.grades), GradeRowSchema);
  const client = new AnthropicJudgeClient(
    process.env.AUDITOR_MODEL || 'claude-sonnet-5-5',
    'high',
    new Anthropic({ maxRetries: 0, timeout: 10 * 60 * 1000 }),
  );

  let audits: AuditRow[];
  if (values.reuse) {
    audits = readJsonLines(join(dir, AUDIT_FILES.rows), AuditRowSchema);
  } else {
    const rows = results.flatMap((row) => {
      const clinicalCase = casesById.get(row.caseId);
      return clinicalCase && row.status === 'ok' ? [{ row, clinicalCase }] : [];
    });
    console.log(`Auditando ${rows.length} análise(s) com ${client.model}...`);
    audits = await mapWithConcurrency(rows, Number(values.concurrency), ({ row, clinicalCase }) =>
      auditRow(client, row, clinicalCase),
    );
  }
  writeJsonLines(join(dir, AUDIT_FILES.rows), audits);
  const agreement = measureAgreement(audits, grades, casesById);
  writeFileSync(join(dir, AUDIT_FILES.report), renderAgreement(dir, audits, agreement));
  console.log(
    `  sensibilidade ${agreement.truePositives.length}/${agreement.truePositives.length + agreement.falseNegatives.length} · alertas sem erro no gabarito ${agreement.falsePositives.length} · ${join(dir, AUDIT_FILES.report)}`,
  );
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
