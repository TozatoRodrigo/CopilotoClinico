import { join } from 'node:path';
import type { ClinicalCase } from './case.schema';
import { actionPasses, actionPassesStrict } from './graders/judge';
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
  reps: number;
  okReps: number;
  criticalErrorReps: number;
  criticalReasons: string[];
  /** Taxas por caso entre as repetições avaliadas, por item; `total` 0 quando não avaliado. */
  syndrome: Rate;
  diagnoses: Rate;
  actions: Rate;
  questions: Rate;
  noForbiddenAction: Rate;
  safeNextStep: Rate;
  /** Afunilamento: fatos decisivos do roteiro revelados pelas respostas, por repetição. */
  keyFacts: Rate;
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
    syndrome: Rate;
    criticalDiagnoses: Rate;
    importantDiagnoses: Rate;
    /** Conduta crítica presente na camada exigida (`actionPasses`). */
    criticalActions: Rate;
    /** Idem, sem aceitar a checagem rápida de segurança antes da conduta "agora". */
    criticalActionsStrict: Rate;
    importantActions: Rate;
    /** Toda conduta do gabarito que aparece em qualquer camada — compara com "condutas obrigatórias" do v1. */
    actionsAnyLayer: Rate;
    questions: Rate;
    noForbiddenAction: Rate;
    safeNextStep: Rate;
  };
  bySyndromeGroup: Array<{
    group: string;
    rows: number;
    syndrome: Rate;
    criticalActions: Rate;
    criticalErrorCases: number;
  }>;
  /** O formato da resposta entregue (último turno, no afunilamento). */
  shape: {
    questionsMean: number | null;
    recommendationsMean: number | null;
    nowMean: number | null;
  };
  /** Só no afunilamento. */
  funnel: {
    rows: number;
    /** Repetições em que TODOS os fatos `key` do roteiro foram revelados. */
    allKeyFactsRevealed: Rate;
    turnsMean: number | null;
    simulatorUsd: number | null;
  } | null;
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
  /**
   * F1 — de onde vêm as condutas da decisão v2 e o que a pesquisa web fez.
   * `recommendations` conta só as que têm `basis` (decisão v2).
   */
  evidence: {
    recommendations: number;
    /** Condutas com `basis: 'source'` entre as que têm base. */
    sourced: Rate;
    webOfficial: number;
    modelKnowledge: number;
    unverifiedDose: number;
    research: {
      runs: number;
      /** Pesquisas que não entregaram evidência e seguiram só com o modelo. */
      fallbacks: number;
      webSearches: number;
      costUsd: number | null;
      latencyP50: number | null;
    };
  };
  /**
   * ADR-016 — dos casos críticos do gabarito com entendimento, quantos a
   * Etapa 1 marcou como graves (instável ou tempo-crítico). Os demais iriam
   * para o modelo do caso comum. `null` sem entendimento (legacy).
   */
  severityRouting: { criticalCasesSevere: Rate; criticalCaseIdsStandard: string[] } | null;
  /**
   * CC-333 — escores citados com número nas respostas, conferidos com o motor
   * das Ferramentas. `null` quando nenhuma nota traz a observação (execuções
   * notadas antes da métrica).
   */
  scoreCitations: {
    rows: number;
    /** Respostas conferidas pelo sistema (COPILOT_DETERMINISTIC_SCORES=on). */
    verifiedRows: number;
    /** Como o modelo escreveu, antes de qualquer correção. */
    cited: number;
    /** "Escore citado ≠ motor": entre os que o motor ou o valor do caso confere. */
    divergent: Rate;
    /** Sem dado para o motor nem valor no caso: estimados pelo modelo. */
    withoutInputs: number;
    /** No texto entregue ao médico: com a flag, zero e zero. */
    deliveredDivergent: number;
    deliveredWithoutInputs: number;
  } | null;
  perCase: CaseSummary[];
}

function summarizeScoreCitations(grades: GradeRow[]): RunSummary['scoreCitations'] {
  const observed = grades.flatMap((grade) =>
    grade.deterministic.scoreCitations ? [grade.deterministic.scoreCitations] : [],
  );
  if (observed.length === 0) return null;
  const sum = (count: (observation: (typeof observed)[number]) => number) =>
    observed.reduce((total, observation) => total + count(observation), 0);
  return {
    rows: observed.length,
    verifiedRows: observed.filter((observation) => observation.verified).length,
    cited: sum((observation) => observation.cited),
    divergent: rateOf(
      observed.flatMap((observation) => [
        ...Array<boolean>(observation.divergent).fill(true),
        ...Array<boolean>(observation.matching).fill(false),
      ]),
    ),
    withoutInputs: sum((observation) => observation.withoutInputs),
    deliveredDivergent: sum((observation) => observation.deliveredDivergent),
    deliveredWithoutInputs: sum((observation) => observation.deliveredWithoutInputs),
  };
}

function summarizeSeverityRouting(
  results: ResultRow[],
  casesById: Map<string, ClinicalCase>,
): RunSummary['severityRouting'] {
  const criticalRows = results.filter(
    (row) => row.understanding !== null && casesById.get(row.caseId)?.critical === true,
  );
  if (criticalRows.length === 0) return null;
  const isSevere = (row: ResultRow) =>
    row.understanding !== null &&
    (row.understanding.timeCritical || row.understanding.instability.present);
  return {
    criticalCasesSevere: rateOf(criticalRows.map(isSevere)),
    criticalCaseIdsStandard: [
      ...new Set(criticalRows.filter((row) => !isSevere(row)).map((row) => row.caseId)),
    ].sort(),
  };
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
  const diagnoses = verdicts.flatMap((verdict) => verdict.diagnoses);
  const actions = verdicts.flatMap((verdict) => verdict.actions);

  return {
    syndrome: verdicts.map((verdict) => verdict.syndromeCorrect.pass),
    criticalDiagnoses: diagnoses
      .filter((item) => item.tier === 'critical')
      .map((item) => item.pass),
    importantDiagnoses: diagnoses
      .filter((item) => item.tier === 'important')
      .map((item) => item.pass),
    criticalActions: actions.filter((item) => item.tier === 'critical').map(actionPasses),
    criticalActionsStrict: actions
      .filter((item) => item.tier === 'critical')
      .map(actionPassesStrict),
    importantActions: actions.filter((item) => item.tier === 'important').map(actionPasses),
    actionsAnyLayer: actions.map((item) => item.placement !== 'absent'),
    diagnoses: diagnoses.map((item) => item.pass),
    actions: actions.map(actionPasses),
    questions: verdicts.flatMap((verdict) => verdict.questions.map((item) => item.pass)),
    noForbiddenAction: withForbidden.map(noForbiddenActionPass),
    safeNextStep: verdicts.map((verdict) => verdict.safeNextStep.pass),
  };
}

/** Fatos `key` do roteiro revelados em algum turno; `null` fora do afunilamento ou sem fato `key`. */
function allKeyFactsRevealed(
  row: ResultRow,
  clinicalCase: ClinicalCase | undefined,
): boolean | null {
  const keyFacts = clinicalCase?.input.funnel?.script.filter((fact) => fact.key) ?? [];
  if (row.mode !== 'funnel' || keyFacts.length === 0) return null;
  const revealed = new Set(
    row.turns.flatMap((turn) => turn.exchanges.flatMap((exchange) => exchange.factIds)),
  );
  return keyFacts.every((fact) => revealed.has(fact.id));
}

function summarizeCase(
  clinicalCase: ClinicalCase,
  grades: GradeRow[],
  results: ResultRow[],
  casesById: Map<string, ClinicalCase>,
): CaseSummary {
  const outcomes = criterionOutcomes(grades, casesById);
  const criticalGrades = grades.filter((grade) => grade.criticalError.value);
  return {
    caseId: clinicalCase.id,
    syndromeGroup: clinicalCase.tags[0],
    critical: clinicalCase.critical,
    reps: grades.length,
    okReps: grades.filter((grade) => grade.status === 'ok').length,
    criticalErrorReps: criticalGrades.length,
    criticalReasons: [...new Set(criticalGrades.flatMap((grade) => grade.criticalError.reasons))],
    syndrome: rateOf(outcomes.syndrome),
    diagnoses: rateOf(outcomes.diagnoses),
    actions: rateOf(outcomes.actions),
    questions: rateOf(outcomes.questions),
    noForbiddenAction: rateOf(outcomes.noForbiddenAction),
    safeNextStep: rateOf(outcomes.safeNextStep),
    keyFacts: rateOf(
      results.flatMap((row) => {
        const revealed = allKeyFactsRevealed(row, clinicalCase);
        return revealed === null ? [] : [revealed];
      }),
    ),
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

/** F1 — base das condutas da decisão v2 e custo da pesquisa web. */
function summarizeEvidence(results: ResultRow[]): RunSummary['evidence'] {
  const recommendations = results
    .filter((row) => row.status === 'ok')
    .flatMap((row) => row.output?.recommendations ?? [])
    .filter((recommendation) => recommendation.basis !== undefined);
  const researched = results.flatMap((row) => (row.research ? [row.research] : []));
  return {
    recommendations: recommendations.length,
    sourced: rateOf(recommendations.map((recommendation) => recommendation.basis === 'source')),
    webOfficial: recommendations.filter(
      (recommendation) => recommendation.origin === 'web_official',
    ).length,
    modelKnowledge: recommendations.filter(
      (recommendation) => recommendation.basis === 'model_knowledge',
    ).length,
    unverifiedDose: recommendations.filter(
      (recommendation) => recommendation.preliminaryReason === 'unverified_dose',
    ).length,
    research: {
      runs: researched.length,
      fallbacks: researched.filter((research) => research.fallbackReason !== null).length,
      webSearches: researched.reduce((sum, research) => sum + research.webSearchRequests, 0),
      costUsd: sumKnown(researched.map((research) => research.cost)).total,
      latencyP50: percentile(
        researched.map((research) => research.latencyMs),
        0.5,
      ),
    },
  };
}

function summarizeFunnel(
  results: ResultRow[],
  casesById: Map<string, ClinicalCase>,
): RunSummary['funnel'] {
  const funnelRows = results.filter((row) => row.mode === 'funnel');
  if (funnelRows.length === 0) return null;
  return {
    rows: funnelRows.length,
    allKeyFactsRevealed: rateOf(
      funnelRows.flatMap((row) => {
        const revealed = allKeyFactsRevealed(row, casesById.get(row.caseId));
        return revealed === null ? [] : [revealed];
      }),
    ),
    turnsMean: mean(funnelRows.map((row) => row.turns.length)),
    simulatorUsd: sumKnown(
      funnelRows.flatMap((row) => row.turns.map((turn) => turn.simulator?.costUsd ?? null)),
    ).total,
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
  const resultsByCase = new Map<string, ResultRow[]>();
  for (const row of results)
    resultsByCase.set(row.caseId, [...(resultsByCase.get(row.caseId) ?? []), row]);

  const perCase = gradedCases.map((clinicalCase) =>
    summarizeCase(
      clinicalCase,
      gradesByCase.get(clinicalCase.id) ?? [],
      resultsByCase.get(clinicalCase.id) ?? [],
      casesById,
    ),
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

  const groups = [...new Set(perCase.map((summary) => summary.syndromeGroup))].sort();
  const bySyndromeGroup = groups.map((group) => {
    const groupGrades = grades.filter((grade) => casesById.get(grade.caseId)?.tags[0] === group);
    const groupOutcomes = criterionOutcomes(groupGrades, casesById);
    return {
      group,
      rows: groupGrades.length,
      syndrome: rateOf(groupOutcomes.syndrome),
      criticalActions: rateOf(groupOutcomes.criticalActions),
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
      syndrome: rateOf(outcomes.syndrome),
      criticalDiagnoses: rateOf(outcomes.criticalDiagnoses),
      importantDiagnoses: rateOf(outcomes.importantDiagnoses),
      criticalActions: rateOf(outcomes.criticalActions),
      criticalActionsStrict: rateOf(outcomes.criticalActionsStrict),
      importantActions: rateOf(outcomes.importantActions),
      actionsAnyLayer: rateOf(outcomes.actionsAnyLayer),
      questions: rateOf(outcomes.questions),
      noForbiddenAction: rateOf(outcomes.noForbiddenAction),
      safeNextStep: rateOf(outcomes.safeNextStep),
    },
    bySyndromeGroup,
    shape: {
      questionsMean: mean(okResults.map((row) => row.output?.clarifyingQuestions.length ?? 0)),
      recommendationsMean: mean(okResults.map((row) => row.output?.recommendations.length ?? 0)),
      nowMean: mean(
        grades.flatMap((grade) =>
          grade.deterministic.shape ? [grade.deterministic.shape.nowRecommendations] : [],
        ),
      ),
    },
    funnel: summarizeFunnel(results, casesById),
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
    evidence: summarizeEvidence(results),
    severityRouting: summarizeSeverityRouting(results, casesById),
    scoreCitations: summarizeScoreCitations(grades),
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
  ['syndrome', 'Síndrome correta (juiz)'],
  ['criticalDiagnoses', 'Diagnósticos críticos considerados — por item'],
  ['importantDiagnoses', 'Diagnósticos importantes considerados — por item'],
  ['criticalActions', 'Condutas críticas na camada exigida — por item'],
  [
    'criticalActionsStrict',
    'Condutas críticas para agora sem nem checagem rápida antes (estrito) — por item',
  ],
  ['importantActions', 'Condutas importantes na camada exigida — por item'],
  ['actionsAnyLayer', 'Condutas do gabarito presentes em qualquer camada — por item'],
  ['questions', 'Dados ausentes pedidos — por item'],
  ['noForbiddenAction', 'Sem conduta proibida para agora (regex + juiz)'],
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

  lines.push(
    `# Gabarito clínico — ${summary.variant}${meta.mode === 'funnel' ? ' (afunilamento)' : ''}`,
    '',
  );
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
          `${meta.caseSet.set === 'blind' ? 'PROVA CEGA · ' : ''}versão ${meta.caseSet.version} · ${summary.caseCount} casos · seletor ${meta.caseSet.selector ?? 'todos'}`,
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
          'Decisão',
          `raciocínio ${meta.pipeline.reasoning} · prompt ${meta.pipeline.decisionPrompt} · fonte de conhecimento ${meta.pipeline.knowledgeSource}${
            meta.pipeline.decisionModel || meta.pipeline.decisionCriticalModel
              ? ` · modelo da decisão ${meta.pipeline.decisionModel ?? meta.pipeline.requestedModel} (caso grave: ${meta.pipeline.decisionCriticalModel ?? meta.pipeline.decisionModel ?? meta.pipeline.requestedModel})`
              : ''
          }${
            meta.pipeline.research
              ? ` · pesquisa ${meta.pipeline.research.model} (effort ${meta.pipeline.research.effort}, até ${meta.pipeline.research.maxSearches} buscas, ${meta.pipeline.research.allowedDomains.length} domínios)`
              : ''
          }`,
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

  lines.push(
    `Formato da resposta (médias por análise): ${summary.shape.questionsMean?.toFixed(2) ?? '—'} pergunta(s) · ${summary.shape.recommendationsMean?.toFixed(1) ?? '—'} conduta(s) · ${summary.shape.nowMean?.toFixed(1) ?? '—'} para agora`,
    '',
  );
  if (summary.severityRouting) {
    const { criticalCasesSevere, criticalCaseIdsStandard } = summary.severityRouting;
    lines.push(
      `Gravidade pela Etapa 1 (ADR-016): ${formatRate(criticalCasesSevere)} das execuções de casos críticos marcadas como graves (instável ou tempo-crítico).${
        criticalCaseIdsStandard.length > 0
          ? ` Iriam para o modelo do caso comum: ${criticalCaseIdsStandard.join(', ')}.`
          : ''
      }`,
      '',
    );
  }
  if (summary.funnel) {
    lines.push('## Afunilamento', '');
    lines.push(
      table(
        ['Métrica', 'Valor'],
        [
          ['Execuções', String(summary.funnel.rows)],
          [
            'Todos os fatos decisivos do roteiro revelados pelas respostas',
            formatRate(summary.funnel.allKeyFactsRevealed),
          ],
          ['Turnos por caso (média)', summary.funnel.turnsMean?.toFixed(2) ?? '—'],
          ['Custo do médico simulado (separado)', formatUsd(summary.funnel.simulatorUsd)],
        ],
      ),
      '',
    );
  }

  lines.push('## Por síndrome de PS', '');
  lines.push(
    table(
      [
        'Síndrome (tags[0])',
        'Execuções',
        'Síndrome correta',
        'Condutas críticas',
        'Casos com erro crítico',
      ],
      summary.bySyndromeGroup.map((group) => [
        group.group,
        String(group.rows),
        formatFraction(group.syndrome),
        formatFraction(group.criticalActions),
        String(group.criticalErrorCases),
      ]),
    ),
    '',
  );

  const { evidence } = summary;
  if (evidence.recommendations > 0 || evidence.research.runs > 0) {
    lines.push('## Base das condutas e pesquisa web (decisão v2)', '');
    lines.push(
      table(
        ['Métrica', 'Valor'],
        [
          ['Condutas com fonte citada (basis "source")', formatRate(evidence.sourced)],
          ['… citando fonte oficial externa (pesquisa web)', String(evidence.webOfficial)],
          ['Condutas do conhecimento geral do modelo', String(evidence.modelKnowledge)],
          ['… ainda com dose sem fonte depois do retry', String(evidence.unverifiedDose)],
          [
            'Pesquisas web',
            `${evidence.research.runs} · ${evidence.research.fallbacks} sem evidência (seguiram só com o modelo) · ${evidence.research.webSearches} buscas`,
          ],
          [
            'Custo e latência da pesquisa (incluídos no pipeline)',
            `${formatUsd(evidence.research.costUsd)} · p50 ${formatMs(evidence.research.latencyP50)}`,
          ],
        ],
      ),
      '',
    );
  }

  const scores = summary.scoreCitations;
  if (scores && (scores.cited > 0 || scores.verifiedRows > 0)) {
    lines.push('## Escores citados × motor (CC-333)', '');
    lines.push(
      table(
        ['Métrica', 'Valor'],
        [
          [
            'Respostas conferidas pelo sistema (COPILOT_DETERMINISTIC_SCORES=on)',
            `${scores.verifiedRows}/${scores.rows}`,
          ],
          ['Escores citados com número, como o modelo escreveu', String(scores.cited)],
          [
            'Escore citado ≠ motor (entre os que o motor ou o valor do caso confere)',
            formatRate(scores.divergent),
          ],
          [
            'Escores citados sem dado para o motor (estimados pelo modelo)',
            String(scores.withoutInputs),
          ],
          [
            'No texto entregue ao médico: ≠ motor / sem dado',
            `${scores.deliveredDivergent} / ${scores.deliveredWithoutInputs}`,
          ],
        ],
      ),
      '',
      'Com a flag ligada, a conferência depois da decisão deixa o texto entregue em 0 / 0; as linhas de cima medem o que o modelo escreveu antes dela. Sem a flag, as duas medidas são a mesma resposta.',
      '',
    );
  }

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
        'Entregues',
        'Síndrome',
        'Diagnósticos',
        'Condutas',
        'Pedidos',
        'Sem proibida',
        'Seguro',
        'Fatos decisivos',
        'Erro crítico',
      ],
      summary.perCase.map((caseSummary) => [
        caseSummary.caseId,
        caseSummary.critical ? 'sim' : '',
        `${caseSummary.okReps}/${caseSummary.reps}`,
        formatFraction(caseSummary.syndrome),
        formatFraction(caseSummary.diagnoses),
        formatFraction(caseSummary.actions),
        formatFraction(caseSummary.questions),
        formatFraction(caseSummary.noForbiddenAction),
        formatFraction(caseSummary.safeNextStep),
        formatFraction(caseSummary.keyFacts),
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
