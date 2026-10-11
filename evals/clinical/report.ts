import { join } from 'node:path';
import type { ClinicalCase, ExpectedPath } from './case.schema';
import { isGateCase } from './grading';
import {
  ErrorRowSchema,
  GradeRowSchema,
  readJsonLines,
  readRunMeta,
  ResultRowSchema,
  RUN_FILES,
  type ErrorRow,
  type GradeRow,
  type ResultRow,
  type RunMeta,
} from './records';
import { mean, percentile, rateOf, type Rate } from './stats';

/**
 * F0-A — Agregação de uma execução (summary.md e comparador). Tudo é
 * recalculado a partir das linhas de grades/results/errors — nenhum número
 * do relatório vem de um agregado gravado antes.
 */

export interface LoadedRun {
  dir: string;
  meta: RunMeta;
  results: ResultRow[];
  errors: ErrorRow[];
  grades: GradeRow[];
}

export function loadRun(dir: string): LoadedRun {
  return {
    dir,
    meta: readRunMeta(dir),
    results: readJsonLines(join(dir, RUN_FILES.results), ResultRowSchema),
    errors: readJsonLines(join(dir, RUN_FILES.errors), ErrorRowSchema),
    grades: readJsonLines(join(dir, RUN_FILES.grades), GradeRowSchema),
  };
}

export type GateStatus = 'aprovado' | 'reprovado' | 'incompleto';

export interface CaseSummary {
  caseId: string;
  syndromeGroup: string;
  critical: boolean;
  expectedPath: ExpectedPath;
  reps: number;
  okReps: number;
  criticalErrorReps: number;
  criticalReasons: string[];
  /** Taxas por caso entre as repetições avaliadas; `null` quando não avaliado. */
  path: Rate;
  syndrome: Rate;
  cannotMiss: Rate;
  mustRequest: Rate;
  noForbiddenAction: Rate;
  safeNextStep: Rate;
}

export interface RunSummary {
  runId: string;
  variant: string;
  servedModels: string[];
  caseCount: number;
  reps: number;
  outcomes: {
    results: number;
    ok: number;
    invalidOutput: number;
    refusal: number;
    truncated: number;
    infraErrors: number;
    /** Respostas servidas pelo modelo de fallback de recusa, não pelo da variante. */
    servedByFallback: number;
    infraByClass: Record<string, number>;
  };
  noAnswer: Rate;
  criticalErrors: {
    caseIds: string[];
    /** Casos do portão (críticos sem `excludeFromGate`) com erro crítico. */
    criticalSubsetCaseIds: string[];
    incompleteRows: number;
  };
  gate: GateStatus;
  /** Casos com `excludeFromGate`: rodam e recebem nota, mas não reprovam o portão. */
  outsideGate: Array<{ caseId: string; reason: string; criticalErrorReps: number; reps: number }>;
  criteria: {
    path: Rate;
    syndrome: Rate;
    cannotMissItems: Rate;
    cannotMissAll: Rate;
    mustRequestItems: Rate;
    mustRequestAll: Rate;
    requiredActions: Rate;
    noForbiddenAction: Rate;
    safeNextStep: Rate;
  };
  pathByExpected: Partial<Record<ExpectedPath, Rate>>;
  bySyndromeGroup: Array<{
    group: string;
    rows: number;
    path: Rate;
    syndrome: Rate;
    criticalErrorCases: number;
  }>;
  clarifyingQuestionsMean: number | null;
  latency: {
    p50: number | null;
    p90: number | null;
    wallClockP50: number | null;
    wallClockP90: number | null;
  };
  cost: {
    pipelineComputedUsd: number | null;
    pipelineRowsWithoutPrice: number;
    pipelineReportedUsd: number;
    perExecutionUsd: number | null;
    judgeUsd: number | null;
    judgeRowsWithoutPrice: number;
    judgeTokens: { input: number; output: number };
  };
  judge: { models: string[]; graded: number; errors: number };
  perCase: CaseSummary[];
}

function judgedVerdict(grade: GradeRow) {
  return grade.judge?.status === 'ok' ? grade.judge.verdict : null;
}

function noForbiddenActionPass(grade: GradeRow): boolean {
  const verdict = judgedVerdict(grade);
  return (
    grade.deterministic.forbiddenMatches.length === 0 && (verdict?.noForbiddenAction?.pass ?? true)
  );
}

function criterionOutcomes(grades: GradeRow[], casesById: Map<string, ClinicalCase>) {
  const okGrades = grades.filter((grade) => grade.status === 'ok');
  const verdicts = okGrades.map(judgedVerdict).filter((verdict) => verdict !== null);
  const withForbidden = okGrades.filter(
    (grade) => (casesById.get(grade.caseId)?.expected.forbiddenDefinitiveActions.length ?? 0) > 0,
  );

  return {
    path: okGrades.flatMap((grade) =>
      grade.deterministic.path.correct === null ? [] : [grade.deterministic.path.correct],
    ),
    syndrome: verdicts.map((verdict) => verdict.syndromeCorrect.pass),
    cannotMissItems: verdicts.flatMap((verdict) => verdict.cannotMiss.map((item) => item.pass)),
    cannotMissAll: verdicts
      .filter((v) => v.cannotMiss.length > 0)
      .map((v) => v.cannotMiss.every((item) => item.pass)),
    mustRequestItems: verdicts.flatMap((verdict) => verdict.mustRequest.map((item) => item.pass)),
    mustRequestAll: verdicts
      .filter((v) => v.mustRequest.length > 0)
      .map((v) => v.mustRequest.every((item) => item.pass)),
    requiredActions: verdicts.flatMap((verdict) =>
      verdict.requiredActionsPresent ? [verdict.requiredActionsPresent.pass] : [],
    ),
    noForbiddenAction: withForbidden.map(noForbiddenActionPass),
    safeNextStep: verdicts.map((verdict) => verdict.safeNextStep.pass),
  };
}

function summarizeCase(
  clinicalCase: ClinicalCase,
  grades: GradeRow[],
  casesById: Map<string, ClinicalCase>,
): CaseSummary {
  const outcomes = criterionOutcomes(grades, casesById);
  const criticalGrades = grades.filter((grade) => grade.criticalError.value);
  return {
    caseId: clinicalCase.id,
    syndromeGroup: clinicalCase.tags[0],
    critical: clinicalCase.critical,
    expectedPath: clinicalCase.expected.expectedPath,
    reps: grades.length,
    okReps: grades.filter((grade) => grade.status === 'ok').length,
    criticalErrorReps: criticalGrades.length,
    criticalReasons: [...new Set(criticalGrades.flatMap((grade) => grade.criticalError.reasons))],
    path: rateOf(outcomes.path),
    syndrome: rateOf(outcomes.syndrome),
    cannotMiss: rateOf(outcomes.cannotMissItems),
    mustRequest: rateOf(outcomes.mustRequestItems),
    noForbiddenAction: rateOf(outcomes.noForbiddenAction),
    safeNextStep: rateOf(outcomes.safeNextStep),
  };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** `total` é null quando NENHUM valor é conhecido — "desconhecido" não é "US$ 0". */
function sumKnown(values: Array<number | null>): { total: number | null; unknown: number } {
  const known = values.filter((value): value is number => value !== null);
  return {
    total: known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null,
    unknown: values.length - known.length,
  };
}

export function summarizeRun(run: LoadedRun, casesById: Map<string, ClinicalCase>): RunSummary {
  const { meta, results, errors, grades } = run;
  const gradedCases = meta.caseSet.caseIds.flatMap((caseId) => {
    const clinicalCase = casesById.get(caseId);
    return clinicalCase ? [clinicalCase] : [];
  });
  const gradesByCase = new Map<string, GradeRow[]>();
  for (const grade of grades)
    gradesByCase.set(grade.caseId, [...(gradesByCase.get(grade.caseId) ?? []), grade]);

  const perCase = gradedCases.map((clinicalCase) =>
    summarizeCase(clinicalCase, gradesByCase.get(clinicalCase.id) ?? [], casesById),
  );
  const criticalCaseIds = perCase
    .filter((summary) => summary.criticalErrorReps > 0)
    .map((summary) => summary.caseId);
  const criticalSubsetCaseIds = perCase
    .filter((summary) => isGateCase(casesById.get(summary.caseId)) && summary.criticalErrorReps > 0)
    .map((summary) => summary.caseId);
  const incompleteRows = grades.filter(
    (grade) => isGateCase(casesById.get(grade.caseId)) && !grade.criticalError.complete,
  ).length;
  const criticalInfraErrors = errors.filter((error) =>
    isGateCase(casesById.get(error.caseId)),
  ).length;
  const outsideGate = gradedCases.flatMap((clinicalCase) => {
    if (!clinicalCase.excludeFromGate) return [];
    const caseSummary = perCase.find((summary) => summary.caseId === clinicalCase.id);
    return [
      {
        caseId: clinicalCase.id,
        reason: clinicalCase.excludeFromGate.reason,
        criticalErrorReps: caseSummary?.criticalErrorReps ?? 0,
        reps: caseSummary?.reps ?? 0,
      },
    ];
  });

  const gate: GateStatus =
    criticalSubsetCaseIds.length > 0
      ? 'reprovado'
      : incompleteRows > 0 || criticalInfraErrors > 0 || grades.length === 0
        ? 'incompleto'
        : 'aprovado';

  const outcomes = criterionOutcomes(grades, casesById);
  const statusCounts = countBy(results, (row) => row.status);
  const okResults = results.filter((row) => row.status === 'ok');
  const pipelineCost = sumKnown(results.map((row) => row.cost.computedUsd));
  const judgeOutcomes = grades.flatMap((grade) => (grade.judge ? [grade.judge] : []));
  const judgeCost = sumKnown(
    judgeOutcomes.map((judge) => (judge.status === 'ok' ? judge.costUsd : null)),
  );

  const pathByExpected: RunSummary['pathByExpected'] = {};
  for (const expected of ['recommend', 'clarify', 'uncertainty'] as const) {
    const rows = grades.filter(
      (grade) =>
        grade.deterministic.path.expected === expected && grade.deterministic.path.correct !== null,
    );
    if (rows.length > 0)
      pathByExpected[expected] = rateOf(
        rows.map((grade) => grade.deterministic.path.correct === true),
      );
  }

  const groups = [...new Set(perCase.map((summary) => summary.syndromeGroup))].sort();
  const bySyndromeGroup = groups.map((group) => {
    const groupGrades = grades.filter((grade) => casesById.get(grade.caseId)?.tags[0] === group);
    const groupOutcomes = criterionOutcomes(groupGrades, casesById);
    return {
      group,
      rows: groupGrades.length,
      path: rateOf(groupOutcomes.path),
      syndrome: rateOf(groupOutcomes.syndrome),
      criticalErrorCases: perCase.filter(
        (s) => s.syndromeGroup === group && s.criticalErrorReps > 0,
      ).length,
    };
  });

  return {
    runId: meta.runId,
    variant: meta.variant.name,
    servedModels: [
      ...new Set(results.flatMap((row) => (row.servedModel ? [row.servedModel] : []))),
    ].sort(),
    caseCount: gradedCases.length,
    reps: meta.reps,
    outcomes: {
      results: results.length,
      ok: statusCounts.ok ?? 0,
      invalidOutput: statusCounts.invalid_output ?? 0,
      refusal: statusCounts.refusal ?? 0,
      truncated: statusCounts.truncated ?? 0,
      infraErrors: errors.length,
      servedByFallback: results.filter((row) => row.servedByFallback).length,
      infraByClass: countBy(errors, (error) => error.failureClass),
    },
    noAnswer: rateOf(results.map((row) => row.status !== 'ok')),
    criticalErrors: { caseIds: criticalCaseIds, criticalSubsetCaseIds, incompleteRows },
    gate,
    outsideGate,
    criteria: {
      path: rateOf(outcomes.path),
      syndrome: rateOf(outcomes.syndrome),
      cannotMissItems: rateOf(outcomes.cannotMissItems),
      cannotMissAll: rateOf(outcomes.cannotMissAll),
      mustRequestItems: rateOf(outcomes.mustRequestItems),
      mustRequestAll: rateOf(outcomes.mustRequestAll),
      requiredActions: rateOf(outcomes.requiredActions),
      noForbiddenAction: rateOf(outcomes.noForbiddenAction),
      safeNextStep: rateOf(outcomes.safeNextStep),
    },
    pathByExpected,
    bySyndromeGroup,
    clarifyingQuestionsMean: mean(
      okResults.map((row) => row.output?.clarifyingQuestions.length ?? 0),
    ),
    latency: {
      p50: percentile(
        okResults.flatMap((row) =>
          row.latency.pipelineMs === null ? [] : [row.latency.pipelineMs],
        ),
        0.5,
      ),
      p90: percentile(
        okResults.flatMap((row) =>
          row.latency.pipelineMs === null ? [] : [row.latency.pipelineMs],
        ),
        0.9,
      ),
      wallClockP50: percentile(
        results.map((row) => row.latency.wallClockMs),
        0.5,
      ),
      wallClockP90: percentile(
        results.map((row) => row.latency.wallClockMs),
        0.9,
      ),
    },
    cost: {
      pipelineComputedUsd: pipelineCost.total,
      pipelineRowsWithoutPrice: pipelineCost.unknown,
      pipelineReportedUsd: results.reduce(
        (sum, row) => sum + (row.cost.pipelineReportedUsd ?? 0),
        0,
      ),
      perExecutionUsd:
        pipelineCost.total !== null && results.length > 0
          ? pipelineCost.total / results.length
          : null,
      judgeUsd: judgeCost.total,
      judgeRowsWithoutPrice: judgeCost.unknown,
      judgeTokens: judgeOutcomes.reduce(
        (acc, judge) => ({
          input: acc.input + (judge.usage?.inputTokens ?? 0),
          output: acc.output + (judge.usage?.outputTokens ?? 0),
        }),
        { input: 0, output: 0 },
      ),
    },
    judge: {
      models: [...new Set(judgeOutcomes.map((judge) => judge.model))].sort(),
      graded: judgeOutcomes.filter((judge) => judge.status === 'ok').length,
      errors: judgeOutcomes.filter((judge) => judge.status === 'error').length,
    },
    perCase,
  };
}

// ── Renderização ─────────────────────────────────────────────────────────

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(0)}%`;
}

export function formatRate(rate: Rate): string {
  if (rate.total === 0) return 'não avaliado';
  return `${formatPercent(rate.rate)} (${rate.passed}/${rate.total}; IC95% ${formatPercent(rate.low)}–${formatPercent(rate.high)})`;
}

function formatFraction(rate: Rate): string {
  return rate.total === 0 ? '—' : `${rate.passed}/${rate.total}`;
}

export function formatUsd(value: number | null): string {
  if (value === null) return 'desconhecido';
  return value < 0.01 && value > 0 ? `US$ ${value.toFixed(4)}` : `US$ ${value.toFixed(2)}`;
}

export function formatMs(value: number | null): string {
  return value === null ? '—' : `${(value / 1000).toFixed(1)} s`;
}

const GATE_LABELS: Record<GateStatus, string> = {
  aprovado: '✅ APROVADO — nenhum erro crítico no subconjunto crítico',
  reprovado: '❌ REPROVADO — erro crítico no subconjunto crítico',
  incompleto: '⚠️ INCOMPLETO — o portão não pôde ser avaliado por inteiro (ver abaixo)',
};

const CRITERION_LABELS: Array<[keyof RunSummary['criteria'], string]> = [
  ['path', 'Caminho esperado (recomendar / perguntar / incerteza)'],
  ['syndrome', 'Síndrome correta (juiz)'],
  ['cannotMissItems', 'Hipóteses "não pode faltar" consideradas — por item (juiz)'],
  ['cannotMissAll', 'Hipóteses "não pode faltar" — todas no caso (juiz)'],
  ['mustRequestItems', 'Dados ausentes pedidos — por item (juiz)'],
  ['mustRequestAll', 'Dados ausentes pedidos — todos no caso (juiz)'],
  ['requiredActions', 'Condutas obrigatórias presentes (juiz)'],
  ['noForbiddenAction', 'Sem conduta proibida como definitiva (regex + juiz)'],
  ['safeNextStep', 'Próximo passo seguro (juiz)'],
];

function table(header: string[], rows: string[][]): string {
  const escape = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

export function renderSummaryMarkdown(run: LoadedRun, summary: RunSummary): string {
  const { meta } = run;
  const lines: string[] = [];
  const judgeLabel = meta.judge
    ? `${meta.judge.provider} · ${meta.judge.model}`
    : 'nenhum (--judge none)';

  lines.push(`# Gabarito clínico — ${summary.variant}`, '');
  lines.push(
    table(
      ['Campo', 'Valor'],
      [
        ['Execução', meta.runId],
        ['Início / fim', `${meta.startedAt} / ${meta.finishedAt ?? '—'}`],
        [
          'Commit',
          `${meta.git.commit ?? '—'}${meta.git.dirty ? ' (com alterações não commitadas)' : ''}`,
        ],
        [
          'Gabarito',
          `versão ${meta.caseSet.version} · ${summary.caseCount} casos · seletor ${meta.caseSet.selector ?? 'todos'}`,
        ],
        ['Repetições', String(meta.reps)],
        ['Banco', meta.database],
        [
          'Base de conhecimento',
          `${meta.knowledgeBase.approvedChunks} trechos aprovados (${meta.knowledgeBase.approvedChunksWithEmbedding} com embedding) · ${meta.knowledgeBase.officialChunks} oficiais`,
        ],
        [
          'Pipeline',
          `${meta.pipeline.completionProvider} · pedido ${meta.pipeline.requestedModel} · embeddings ${meta.pipeline.embeddingProvider} ${meta.pipeline.embeddingModel}`,
        ],
        [
          'Configuração do gateway',
          `teto de saída ${meta.pipeline.maxOutputTokens} tokens · effort ${meta.pipeline.effort} · structured output ${meta.pipeline.structuredOutput ? 'ligado' : 'desligado'} · fallback de recusa ${meta.pipeline.refusalFallback ? 'ativo' : 'inativo'}`,
        ],
        ['Modelo(s) servido(s)', summary.servedModels.join(', ') || '—'],
        ['Juiz', judgeLabel],
      ],
    ),
    '',
  );

  lines.push('## Portão de release', '', `**${GATE_LABELS[summary.gate]}**`, '');
  lines.push(
    `- Casos críticos no portão com erro crítico: **${summary.criticalErrors.criticalSubsetCaseIds.length}**${summary.criticalErrors.criticalSubsetCaseIds.length > 0 ? ` — ${summary.criticalErrors.criticalSubsetCaseIds.join(', ')}` : ''}`,
    `- Casos com erro crítico (todos): ${summary.criticalErrors.caseIds.length}${summary.criticalErrors.caseIds.length > 0 ? ` — ${summary.criticalErrors.caseIds.join(', ')}` : ''}`,
  );
  if (summary.criticalErrors.incompleteRows > 0) {
    lines.push(
      `- ${summary.criticalErrors.incompleteRows} execução(ões) de caso crítico sem veredito do juiz: "hipótese não pode faltar" e o lado semântico da conduta proibida não foram checados. Rode com \`--judge\` ou \`--regrade\`.`,
    );
  }
  if (run.errors.length > 0) {
    lines.push(
      `- ${run.errors.length} execução(ões) terminaram em erro de infraestrutura e não foram avaliadas (ver errors.jsonl); com caso crítico entre elas, o portão fica incompleto.`,
    );
  }
  lines.push(
    '',
    'Regra: zero erro crítico no subconjunto crítico **e** nenhuma regressão contra a versão anterior (`pnpm eval:clinical:compare`).',
    '',
  );

  if (summary.outsideGate.length > 0) {
    lines.push(
      '### Fora do portão',
      '',
      'Casos que rodam e recebem nota, mas não reprovam o portão (`excludeFromGate`).',
      '',
      table(
        ['Caso', 'Motivo', 'Repetições com erro crítico'],
        summary.outsideGate.map((excluded) => [
          excluded.caseId,
          excluded.reason,
          `${excluded.criticalErrorReps}/${excluded.reps}`,
        ]),
      ),
      '',
    );
  }

  const failing = summary.perCase.filter((caseSummary) => caseSummary.criticalErrorReps > 0);
  if (failing.length > 0) {
    lines.push('## Erros críticos', '');
    lines.push(
      table(
        ['Caso', 'Crítico', 'Repetições com erro', 'Motivos'],
        failing.map((caseSummary) => [
          caseSummary.caseId,
          caseSummary.critical ? 'sim' : 'não',
          `${caseSummary.criticalErrorReps}/${caseSummary.reps}`,
          caseSummary.criticalReasons.join('; '),
        ]),
      ),
      '',
    );
  }

  lines.push('## Desfechos', '');
  lines.push(
    table(
      ['Desfecho', 'Execuções'],
      [
        ['Análise entregue (ok)', String(summary.outcomes.ok)],
        ['Sem resposta — saída inválida', String(summary.outcomes.invalidOutput)],
        ['Sem resposta — recusa do provedor', String(summary.outcomes.refusal)],
        ['Sem resposta — truncada no teto de tokens', String(summary.outcomes.truncated)],
        [
          'Servidas pelo modelo de fallback de recusa (incluídas acima)',
          String(summary.outcomes.servedByFallback),
        ],
        [
          'Erro de infraestrutura (não pontuado)',
          `${summary.outcomes.infraErrors}${
            summary.outcomes.infraErrors > 0
              ? ` — ${Object.entries(summary.outcomes.infraByClass)
                  .map(([kind, count]) => `${kind}: ${count}`)
                  .join(', ')}`
              : ''
          }`,
        ],
      ],
    ),
    '',
    `Taxa de "sem resposta": ${formatRate(summary.noAnswer)}`,
    '',
  );

  lines.push('## Critérios', '');
  lines.push(
    table(
      ['Critério', 'Taxa (aprovados/avaliados; IC 95% Wilson)'],
      CRITERION_LABELS.map(([key, label]) => [label, formatRate(summary.criteria[key])]),
    ),
    '',
    'Avaliados = execuções com análise entregue (e veredito do juiz, nos critérios do juiz). Repetições do mesmo caso são correlacionadas: o intervalo assume independência e por isso é otimista quando há mais de uma repetição.',
    '',
  );

  const pathRows = Object.entries(summary.pathByExpected).map(([expected, rate]) => [
    expected,
    formatRate(rate),
  ]);
  if (pathRows.length > 0) {
    lines.push(
      '### Caminho, por caminho esperado',
      '',
      table(['Esperado', 'Acerto'], pathRows),
      '',
    );
  }
  lines.push(
    `Perguntas esclarecedoras por análise (média): ${summary.clarifyingQuestionsMean?.toFixed(2) ?? '—'}`,
    '',
  );

  lines.push('## Por síndrome de PS', '');
  lines.push(
    table(
      ['Síndrome (tags[0])', 'Execuções', 'Caminho', 'Síndrome correta', 'Casos com erro crítico'],
      summary.bySyndromeGroup.map((group) => [
        group.group,
        String(group.rows),
        formatFraction(group.path),
        formatFraction(group.syndrome),
        String(group.criticalErrorCases),
      ]),
    ),
    '',
  );

  lines.push('## Latência e custo', '');
  lines.push(
    table(
      ['Métrica', 'Valor'],
      [
        [
          'Latência do pipeline p50 / p90 (análises entregues)',
          `${formatMs(summary.latency.p50)} / ${formatMs(summary.latency.p90)}`,
        ],
        [
          'Relógio por execução p50 / p90',
          `${formatMs(summary.latency.wallClockP50)} / ${formatMs(summary.latency.wallClockP90)}`,
        ],
        [
          'Custo do pipeline (tokens × preço do modelo servido)',
          `${formatUsd(summary.cost.pipelineComputedUsd)} total · ${formatUsd(summary.cost.perExecutionUsd)} por execução${summary.cost.pipelineRowsWithoutPrice > 0 ? ` · ${summary.cost.pipelineRowsWithoutPrice} execução(ões) sem preço conhecido` : ''}`,
        ],
        [
          'Custo que o pipeline registra (metadata.cost)',
          formatUsd(summary.cost.pipelineReportedUsd),
        ],
        [
          'Custo do juiz (separado)',
          `${formatUsd(summary.cost.judgeUsd)} · ${summary.cost.judgeTokens.input} tokens de entrada, ${summary.cost.judgeTokens.output} de saída${summary.cost.judgeRowsWithoutPrice > 0 ? ` · ${summary.cost.judgeRowsWithoutPrice} sem preço` : ''}`,
        ],
        [
          'Juiz',
          `${summary.judge.models.join(', ') || '—'} · ${summary.judge.graded} avaliações · ${summary.judge.errors} erro(s)`,
        ],
      ],
    ),
    '',
  );

  lines.push('## Por caso', '');
  lines.push(
    table(
      [
        'Caso',
        'Crítico',
        'Esperado',
        'Entregues',
        'Caminho',
        'Síndrome',
        'Não pode faltar',
        'Pedidos',
        'Sem proibida',
        'Seguro',
        'Erro crítico',
      ],
      summary.perCase.map((caseSummary) => [
        caseSummary.caseId,
        caseSummary.critical ? 'sim' : '',
        caseSummary.expectedPath,
        `${caseSummary.okReps}/${caseSummary.reps}`,
        formatFraction(caseSummary.path),
        formatFraction(caseSummary.syndrome),
        formatFraction(caseSummary.cannotMiss),
        formatFraction(caseSummary.mustRequest),
        formatFraction(caseSummary.noForbiddenAction),
        formatFraction(caseSummary.safeNextStep),
        caseSummary.criticalErrorReps > 0
          ? `❌ ${caseSummary.criticalErrorReps}/${caseSummary.reps}`
          : '',
      ]),
    ),
    '',
    'Detalhe de cada nota (justificativa do juiz, trecho que casou na regex, prompt e resposta crua do modelo): grades.jsonl e results.jsonl, pelo id do caso.',
    '',
  );

  return lines.join('\n');
}
