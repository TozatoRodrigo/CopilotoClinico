import { join } from 'node:path';
import type { IntakePath } from '../../src/shared/contracts/clinical';
import type { ClinicalCase, ReadingSeverity } from './case.schema';
import {
  conversationExchanges,
  severityRank,
  type ConversationGrade,
} from './graders/conversation';
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
import { mean, percentile, rateOf, wilsonRate, type Rate } from './stats';

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
  /** CC-106 — conversa antes do plano, por repetição: a leitura pegou a síndrome? */
  readingSyndrome: Rate;
  /** CC-106 — a leitura não subestimou a gravidade. */
  readingSeverity: Rate;
  /** CC-106 — nenhuma pergunta essencial ficou faltando antes do plano. */
  essentialQuestions: Rate;
}

export interface ConversationSummary {
  rows: number;
  paths: Partial<Record<IntakePath, number>>;
  /** A leitura enquadrou a abertura na síndrome de PS esperada. */
  readingSyndrome: Rate;
  /** A leitura não subestimou a gravidade; `overTriage` conta as que superestimaram. */
  readingSeverity: Rate;
  overTriage: number;
  questionsBeforePlanMean: number | null;
  roundsToFinalPlanMean: number | null;
  firstQuestionP50: number | null;
  firstQuestionP90: number | null;
  readingP50: number | null;
  /** Por pergunta antes do plano: a resposta revelou algum fato do roteiro. */
  questionsWithScriptFact: Rate;
  /** Por pergunta antes do plano, pelo juiz. */
  pertinentQuestions: Rate;
  alreadyGivenQuestions: Rate;
  /** Por fato `key` do roteiro: revelado antes do 1º plano. */
  keyFactsBeforePlan: Rate;
  /** Por execução de caso com `essentialQuestions`: nenhuma ficou faltando. */
  essentialQuestions: Rate;
  missingEssential: Array<{ caseId: string; rep: number; questions: string[] }>;
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
  /** CC-106 — a conversa antes do plano (Copiloto guiado); só no afunilamento com conversa. */
  conversation: ConversationSummary | null;
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
  perCase: CaseSummary[];
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
  const revealed = new Set(conversationExchanges(row).flatMap((exchange) => exchange.factIds));
  return keyFacts.every((fact) => revealed.has(fact.id));
}

function conversationOutcomes(conversations: ConversationGrade[]) {
  return {
    readingSyndrome: rateOf(
      conversations.flatMap((conversation) =>
        conversation.syndrome ? [conversation.syndrome.pass] : [],
      ),
    ),
    readingSeverity: rateOf(
      conversations.flatMap((conversation) =>
        conversation.severity ? [conversation.severity.pass] : [],
      ),
    ),
    essentialQuestions: rateOf(
      conversations.flatMap((conversation) =>
        conversation.missingEssentialQuestions
          ? [conversation.missingEssentialQuestions.length === 0]
          : [],
      ),
    ),
  };
}

function gradedConversations(grades: GradeRow[]): ConversationGrade[] {
  return grades.flatMap((grade) => (grade.conversation ? [grade.conversation] : []));
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** CC-106 — a conversa antes do plano, de todas as execuções com conversa. */
function summarizeConversation(
  results: ResultRow[],
  grades: GradeRow[],
): RunSummary['conversation'] {
  const conversations = gradedConversations(grades);
  if (conversations.length === 0) return null;
  const judged = grades.flatMap((grade) => judgedVerdict(grade)?.conversation ?? []);
  const known = (values: Array<number | null>) =>
    values.filter((value): value is number => value !== null);
  const firstQuestions = known(conversations.map((conversation) => conversation.firstQuestionMs));
  const readings = results.flatMap((row) =>
    row.intake && row.intake.path !== 'disabled' ? [row.intake.readingMs] : [],
  );

  return {
    rows: conversations.length,
    paths: countBy(conversations, (conversation) => conversation.path),
    ...conversationOutcomes(conversations),
    overTriage: conversations.filter(
      (conversation) =>
        conversation.severity &&
        severityRank(conversation.severity.read) > severityRank(conversation.severity.expected),
    ).length,
    questionsBeforePlanMean: mean(
      conversations.map((conversation) => conversation.questionsBeforePlan),
    ),
    roundsToFinalPlanMean: mean(
      conversations.map((conversation) => conversation.roundsToFinalPlan),
    ),
    firstQuestionP50: percentile(firstQuestions, 0.5),
    firstQuestionP90: percentile(firstQuestions, 0.9),
    readingP50: percentile(readings, 0.5),
    questionsWithScriptFact: wilsonRate(
      sumOf(conversations.map((conversation) => conversation.questionsWithScriptFact)),
      sumOf(conversations.map((conversation) => conversation.questionsBeforePlan)),
    ),
    pertinentQuestions: rateOf(judged.map((question) => question.pertinent)),
    alreadyGivenQuestions: rateOf(judged.map((question) => question.alreadyGiven)),
    keyFactsBeforePlan: wilsonRate(
      sumOf(conversations.map((conversation) => conversation.keyFactsBeforePlan.length)),
      sumOf(conversations.map((conversation) => conversation.keyFacts.length)),
    ),
    missingEssential: grades.flatMap((grade) => {
      const missing = grade.conversation?.missingEssentialQuestions ?? [];
      return missing.length > 0
        ? [{ caseId: grade.caseId, rep: grade.rep, questions: missing }]
        : [];
    }),
  };
}

function summarizeCase(
  clinicalCase: ClinicalCase,
  grades: GradeRow[],
  results: ResultRow[],
  casesById: Map<string, ClinicalCase>,
): CaseSummary {
  const outcomes = criterionOutcomes(grades, casesById);
  const criticalGrades = grades.filter((grade) => grade.criticalError.value);
  const conversation = conversationOutcomes(gradedConversations(grades));
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
    ...conversation,
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
    // CC-106 — inclui as respostas às perguntas antes do plano.
    simulatorUsd: sumKnown(
      funnelRows.flatMap((row) => [
        ...(row.intake?.simulator ? [row.intake.simulator.costUsd] : []),
        ...row.turns.map((turn) => turn.simulator?.costUsd ?? null),
      ]),
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
    conversation: summarizeConversation(results, grades),
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

const PATH_LABELS: Record<IntakePath, string> = {
  ask: 'perguntou',
  complete: 'caso completo, sem pergunta',
  unstable: 'instável, direto ao plano',
  reading_failed: 'leitura falhou ou passou do teto',
  disabled: 'leitura desligada',
};

const SEVERITY_LABELS: Record<ReadingSeverity, string> = {
  stable: 'estável',
  time_critical: 'tempo-crítico',
  unstable: 'instável',
};

function mark(pass: boolean): string {
  return pass ? '✓' : '✗';
}

/** CC-106 — a conversa antes do plano, agregada. */
function renderConversation(conversation: ConversationSummary): string[] {
  const paths = (Object.keys(PATH_LABELS) as IntakePath[])
    .filter((path) => conversation.paths[path])
    .map((path) => `${PATH_LABELS[path]}: ${conversation.paths[path]}`)
    .join(' · ');
  const missing = conversation.missingEssential
    .map((miss) => `${miss.caseId}#${miss.rep} (${miss.questions.join('; ')})`)
    .join('; ');
  return [
    '## Conversa antes do plano (Copiloto guiado)',
    '',
    table(
      ['Métrica', 'Valor'],
      [
        ['Execuções com conversa', String(conversation.rows)],
        ['Caminho da leitura', paths || '—'],
        [
          'Leitura: síndrome de PS esperada (`tags[0]` ou `expected.conversation.syndromes`)',
          formatRate(conversation.readingSyndrome),
        ],
        [
          'Leitura: gravidade não subestimada',
          `${formatRate(conversation.readingSeverity)} · superestimada em ${conversation.overTriage}`,
        ],
        [
          'Perguntas antes do 1º plano (média)',
          conversation.questionsBeforePlanMean?.toFixed(2) ?? '—',
        ],
        [
          'Voltas até o plano avaliado (média)',
          conversation.roundsToFinalPlanMean?.toFixed(2) ?? '—',
        ],
        [
          'Tempo até a 1ª pergunta p50 / p90',
          `${formatMs(conversation.firstQuestionP50)} / ${formatMs(conversation.firstQuestionP90)}`,
        ],
        ['Leitura do caso p50', formatMs(conversation.readingP50)],
        [
          'Perguntas que alcançaram fato do roteiro — por pergunta',
          formatRate(conversation.questionsWithScriptFact),
        ],
        [
          'Perguntas pertinentes (juiz) — por pergunta',
          formatRate(conversation.pertinentQuestions),
        ],
        [
          'Perguntas que pediram dado já dado (juiz; menor é melhor) — por pergunta',
          formatRate(conversation.alreadyGivenQuestions),
        ],
        [
          'Fatos decisivos revelados antes do 1º plano — por fato',
          formatRate(conversation.keyFactsBeforePlan),
        ],
        [
          'Sem pergunta essencial faltando (`expected.conversation.essentialQuestions`)',
          `${formatRate(conversation.essentialQuestions)}${missing ? ` — faltou em ${missing}` : ''}`,
        ],
      ],
    ),
    '',
    'A leitura vê só a abertura. Gravidade esperada: `expected.conversation.severity` ou, no caso crítico, tempo-crítico. Perguntas e fatos de cada execução: "Conversa por caso", no fim.',
    '',
  ];
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * CC-106 — o que cada execução perguntou e o que as respostas revelaram:
 * as perguntas antes do plano (com o veredito do juiz, quando houver) e as
 * do plano, cada uma com os fatos do roteiro que alcançou.
 */
function renderConversationByCase(run: LoadedRun): string[] {
  const lines = ['## Conversa por caso', ''];
  const rows = run.results
    .filter((row) => row.intake)
    .sort((left, right) => left.caseId.localeCompare(right.caseId) || left.rep - right.rep);
  const gradesByKey = new Map(run.grades.map((grade) => [`${grade.caseId}#${grade.rep}`, grade]));

  for (const row of rows) {
    const { intake } = row;
    const key = `${row.caseId}#${row.rep}`;
    const grade = gradesByKey.get(key);
    const conversation = grade?.conversation;
    if (!intake || !grade || !conversation) continue;
    const judgedQuestions = judgedVerdict(grade)?.conversation ?? [];
    const keyFacts = new Set(conversation.keyFacts);
    const facts = (factIds: string[]) =>
      factIds.length === 0
        ? 'nenhum fato do roteiro'
        : factIds.map((id) => (keyFacts.has(id) ? `${id} (decisivo)` : id)).join(', ');
    const reading = [
      conversation.syndrome
        ? `síndrome \`${conversation.syndrome.read}\` (esperada: ${conversation.syndrome.expected.join(' ou ')}) ${mark(conversation.syndrome.pass)}`
        : 'sem leitura',
      conversation.severity
        ? `gravidade ${SEVERITY_LABELS[conversation.severity.read]} (mínima: ${SEVERITY_LABELS[conversation.severity.expected]}) ${mark(conversation.severity.pass)}`
        : '',
      `caminho: ${PATH_LABELS[intake.path]}${intake.closeReason === 'urgent_answer' ? ' (resposta urgente encerrou)' : ''}`,
      intake.firstQuestionMs !== null ? `1ª pergunta em ${formatMs(intake.firstQuestionMs)}` : '',
    ].filter(Boolean);

    lines.push(`### ${key}`, '', `- Leitura: ${reading.join(' · ')}`);
    if (intake.exchanges.length > 0) {
      lines.push('- Antes do plano:');
      intake.exchanges.forEach((exchange, index) => {
        const verdict = judgedQuestions.find((judged) => judged.question === exchange.question);
        const judge = verdict
          ? ` · pertinente ${mark(verdict.pertinent)} · pediu dado já dado ${verdict.alreadyGiven ? 'sim' : 'não'}`
          : '';
        lines.push(
          `  ${index + 1}. ${oneLine(exchange.question)} → ${facts(exchange.factIds)}${judge}`,
        );
      });
    }
    const afterPlanExchanges = row.turns.flatMap((turn) => turn.exchanges);
    if (afterPlanExchanges.length > 0) {
      lines.push('- Depois do 1º plano:');
      afterPlanExchanges.forEach((exchange, index) => {
        lines.push(`  ${index + 1}. ${oneLine(exchange.question)} → ${facts(exchange.factIds)}`);
      });
    }
    if (conversation.keyFacts.length > 0) {
      const beforePlan = new Set(conversation.keyFactsBeforePlan);
      const afterPlan = new Set(afterPlanExchanges.flatMap((exchange) => exchange.factIds));
      const revealedAfter = conversation.keyFacts.filter(
        (id) => !beforePlan.has(id) && afterPlan.has(id),
      );
      const never = conversation.keyFacts.filter((id) => !beforePlan.has(id) && !afterPlan.has(id));
      lines.push(
        `- Fatos decisivos revelados antes do plano: ${conversation.keyFactsBeforePlan.length}/${conversation.keyFacts.length}${[
          conversation.keyFactsBeforePlan.length > 0
            ? ` · antes: ${conversation.keyFactsBeforePlan.join(', ')}`
            : '',
          revealedAfter.length > 0 ? ` · depois do 1º plano: ${revealedAfter.join(', ')}` : '',
          never.length > 0 ? ` · nunca revelados: ${never.join(', ')}` : '',
        ].join('')}`,
      );
    }
    if (conversation.missingEssentialQuestions?.length) {
      lines.push(
        `- Pergunta essencial faltando: ${conversation.missingEssentialQuestions.join('; ')}`,
      );
    }
    lines.push('');
  }
  return lines;
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
          `raciocínio ${meta.pipeline.reasoning} · prompt ${meta.pipeline.decisionPrompt}${meta.pipeline.whyLine ? ' com a linha de por quê' : ''} · fonte de conhecimento ${meta.pipeline.knowledgeSource}${
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
        ...(meta.pipeline.intake
          ? [
              [
                'Copiloto guiado',
                `leitura do caso ${meta.pipeline.intake.mode === 'on' ? 'ligada' : 'desligada'} (COPILOT_INTAKE=${meta.pipeline.intake.mode}) · modelo da leitura ${meta.pipeline.intake.readingModel}`,
              ],
            ]
          : []),
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

  if (summary.conversation) lines.push(...renderConversation(summary.conversation));

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

  if (summary.conversation) lines.push(...renderConversationByCase(run));

  return lines.join('\n');
}
