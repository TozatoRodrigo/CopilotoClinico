import { formatMs, formatUsd, type LoadedRun, type RunSummary } from './report';
import { wilsonRate, type Rate } from './stats';

/**
 * CC-413 — teste da tese do Luiz ("o cérebro é trocável"): o modelo barato
 * com cartões revisados chega ao Opus sem cartões? A primeira execução da
 * comparação é a referência (Opus sem cartões); cada outra é candidata.
 *
 * Métrica de sucesso da história: erros críticos do barato com cartões ≤ os
 * do Opus — no subconjunto crítico (o portão) e em todos os casos. Itens
 * importantes, custo e latência vêm ao lado, para a decisão de preço.
 */

export type ThesisVerdict = 'referência' | 'sustenta' | 'não sustenta' | 'inconclusiva';

export interface ThesisRun {
  summary: Pick<
    RunSummary,
    'variant' | 'servedModels' | 'criticalErrors' | 'criteria' | 'cost' | 'latency' | 'evidence'
  >;
  /** A variante ligou COPILOT_REVIEWED_CARDS. */
  usesCards: boolean;
  /** Modelos da decisão (rota comum e grave, ADR-016) além do AI_MODEL; vazio = só o AI_MODEL. */
  extraDecisionModels: string[];
}

export interface ThesisRow {
  variant: string;
  usesCards: boolean;
  criticalGateCases: number;
  criticalCases: number;
  /** Casos com erro crítico na candidata e sem erro na referência — o que pede revisão caso a caso. */
  newCriticalCases: string[];
  importantItems: Rate;
  costPerExecutionUsd: number | null;
  costRatio: number | null;
  latencyP50: number | null;
  latencyRatio: number | null;
  cardCitations: number;
  cardDoses: number;
  verdict: ThesisVerdict;
  reason: string;
}

function importantItems(summary: ThesisRun['summary']): Rate {
  const { importantDiagnoses, importantActions } = summary.criteria;
  const passed = importantDiagnoses.passed + importantActions.passed;
  const total = importantDiagnoses.total + importantActions.total;
  return wilsonRate(passed, total);
}

function ratio(value: number | null, reference: number | null): number | null {
  return value === null || reference === null || reference === 0 ? null : value / reference;
}

function verdictOf(
  candidate: ThesisRun,
  reference: ThesisRun,
  counts: { gate: number; all: number; refGate: number; refAll: number },
): { verdict: ThesisVerdict; reason: string } {
  if (candidate.extraDecisionModels.length > 0) {
    return {
      verdict: 'inconclusiva',
      reason: `a decisão também passou por ${candidate.extraDecisionModels.join(', ')} (ADR-016): fixe AI_DECISION_MODEL e AI_DECISION_CRITICAL_MODEL no modelo da variante`,
    };
  }
  if (candidate.usesCards && candidate.summary.evidence.reviewedCard === 0) {
    return {
      verdict: 'inconclusiva',
      reason:
        'nenhuma conduta citou cartão: confira os cartões publicados, o índice (pnpm cards:reindex) e o embedding',
    };
  }
  if (candidate.summary.criticalErrors.incompleteRows > 0) {
    return {
      verdict: 'inconclusiva',
      reason: `${candidate.summary.criticalErrors.incompleteRows} resposta(s) sem avaliação de erro crítico`,
    };
  }
  const within = counts.gate <= counts.refGate && counts.all <= counts.refAll;
  return within
    ? {
        verdict: 'sustenta',
        reason: `erros críticos ${counts.gate}/${counts.all} ≤ ${counts.refGate}/${counts.refAll} de ${reference.summary.variant}`,
      }
    : {
        verdict: 'não sustenta',
        reason: `erros críticos ${counts.gate}/${counts.all} > ${counts.refGate}/${counts.refAll} de ${reference.summary.variant}`,
      };
}

export function thesisRows(runs: readonly ThesisRun[]): ThesisRow[] {
  const [reference] = runs;
  if (!reference) return [];
  const refCases = new Set(reference.summary.criticalErrors.caseIds);
  const refGate = reference.summary.criticalErrors.criticalSubsetCaseIds.length;
  const refAll = reference.summary.criticalErrors.caseIds.length;
  return runs.map((run, index) => {
    const { summary } = run;
    const gate = summary.criticalErrors.criticalSubsetCaseIds.length;
    const all = summary.criticalErrors.caseIds.length;
    const { verdict, reason } =
      index === 0
        ? { verdict: 'referência' as const, reason: 'execução A' }
        : verdictOf(run, reference, { gate, all, refGate, refAll });
    return {
      variant: summary.variant,
      usesCards: run.usesCards,
      criticalGateCases: gate,
      criticalCases: all,
      newCriticalCases:
        index === 0 ? [] : summary.criticalErrors.caseIds.filter((caseId) => !refCases.has(caseId)),
      importantItems: importantItems(summary),
      costPerExecutionUsd: summary.cost.perExecutionUsd,
      costRatio: ratio(summary.cost.perExecutionUsd, reference.summary.cost.perExecutionUsd),
      latencyP50: summary.latency.p50,
      latencyRatio: ratio(summary.latency.p50, reference.summary.latency.p50),
      cardCitations: summary.evidence.reviewedCard,
      cardDoses: summary.evidence.reviewedCardWithDose,
      verdict,
      reason,
    };
  });
}

const ON = new Set(['on', 'true', '1']);

/** O que a tese precisa saber da execução além do resumo. */
export function thesisRunOf(run: LoadedRun, summary: RunSummary): ThesisRun {
  const { pipeline, variant } = run.meta;
  const extra = [pipeline.decisionModel, pipeline.decisionCriticalModel].filter(
    (model): model is string => model !== null && model !== pipeline.requestedModel,
  );
  return {
    summary,
    usesCards: ON.has((variant.env.COPILOT_REVIEWED_CARDS ?? '').trim().toLowerCase()),
    extraDecisionModels: [...new Set(extra)],
  };
}

function formatRatio(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}×`;
}

function formatItems(rate: Rate): string {
  return rate.total === 0 || rate.rate === null
    ? 'não avaliado'
    : `${(rate.rate * 100).toFixed(1)}% (${rate.passed}/${rate.total})`;
}

/** Seção "Teste da tese (CC-413)" do relatório de comparação (`--tese`). */
export function renderThesis(rows: readonly ThesisRow[]): string {
  const lines = [
    '## Teste da tese (CC-413): modelo barato com cartões × Opus sem cartões',
    '',
    'A é a referência. A tese se sustenta para uma variante quando os erros críticos dela não passam os de A, no subconjunto crítico (portão) e em todos os casos. Itens importantes = diagnósticos e condutas importantes do gabarito.',
    '',
    '| Variante | Cartões | Erro crítico (portão / todos) | Casos novos com erro crítico | Itens importantes | Custo por execução | Latência p50 | Condutas com cartão (com dose) | Veredito |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  rows.forEach((row, index) => {
    const letter = String.fromCharCode(65 + index);
    lines.push(
      `| ${letter}: ${row.variant} | ${row.usesCards ? 'sim' : 'não'} | ${row.criticalGateCases} / ${row.criticalCases} | ${row.newCriticalCases.join(', ') || '—'} | ${formatItems(row.importantItems)} | ${formatUsd(row.costPerExecutionUsd)}${index > 0 ? ` (${formatRatio(row.costRatio)})` : ''} | ${formatMs(row.latencyP50)}${index > 0 ? ` (${formatRatio(row.latencyRatio)})` : ''} | ${row.cardCitations} (${row.cardDoses}) | **${row.verdict}** — ${row.reason} |`,
    );
  });
  lines.push('');
  return lines.join('\n');
}
