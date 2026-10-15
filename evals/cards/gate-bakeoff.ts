import { JevRequestError } from '../../src/modules/jev/jev-client';
import {
  judgeBySimilarityAndTheme,
  SIMILARITY_THEME_GATE_NAME,
  type CardCandidate,
  type CardRelevanceContext,
  type RelevanceCard,
  type ScoredCardRelevanceGate,
} from '../../src/modules/knowledge-cards/card-retrieval/card-relevance-gate';
import {
  CARD_GATE_THRESHOLD_ENV,
  type CardGateKind,
} from '../../src/modules/knowledge-cards/card-retrieval/card-relevance-gate.settings';
import { CardRerankerRequestError } from '../../src/modules/knowledge-cards/card-retrieval/card-reranker';
import type { SituationGroup } from './gate-pairs';
import {
  brierScore,
  chooseThreshold,
  latencySummary,
  meetsTarget,
  metricsAt,
  reliabilityCurve,
  TARGET_PRECISION,
  TARGET_RECALL,
  type LatencySummary,
  type ReliabilityBin,
  type ScoredPair,
  type ThresholdMetrics,
} from './gate-scoring';

/**
 * CC-407 — o bake-off: roda cada portão sobre os pares rotulados, situação
 * por situação (uma chamada do portão por situação, como numa análise), com
 * freio de gasto, e resume precisão, revocação, F1, calibração, latência e
 * custo. Sem I/O além das chamadas dos portões: o CLI (`gate.ts`) lê os
 * arquivos e grava o relatório.
 */

/** O que o escore de cada portão significa: muda a leitura do Brier e da curva. */
export type GateScoreKind = 'probability' | 'relevance' | 'similarity';

export interface BakeoffGate {
  kind: CardGateKind;
  name: string;
  scoreKind: GateScoreKind;
  /** O limiar que o ambiente dá hoje ao portão (a variável em `CARD_GATE_THRESHOLD_ENV`). */
  currentThreshold: number;
  usdPerMillionInputTokens: number;
  /** `null` quando pode rodar; senão, o que falta (sem chave, sem serviço). */
  unavailable(): string | null;
  estimateInputTokens(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): number;
  /** Um escore por candidato (`null` = não julgou) e os tokens cobrados. */
  score(
    candidates: readonly CardCandidate<RelevanceCard>[],
    context: CardRelevanceContext,
  ): Promise<{ scores: Array<number | null>; inputTokens: number | null }>;
}

/**
 * O portão por limiar como escore: a similaridade quando a síndrome/o tema
 * deixam o cartão entrar, 0 quando não. Assim "escore ≥ limiar" é o mesmo
 * que `judgeBySimilarityAndTheme` com `REVIEWED_CARDS_MIN_SIMILARITY` = limiar,
 * e o limiar sugerido é o valor dessa variável. Par sem similaridade: não julga.
 */
export function thresholdBakeoffGate(currentThreshold: number): BakeoffGate {
  return {
    kind: 'threshold',
    name: SIMILARITY_THEME_GATE_NAME,
    scoreKind: 'similarity',
    currentThreshold,
    usdPerMillionInputTokens: 0,
    unavailable: () => null,
    estimateInputTokens: () => 0,
    score: async (candidates, context) => ({
      scores: candidates.map((candidate) => {
        if (!Number.isFinite(candidate.similarity)) return null;
        const verdict = judgeBySimilarityAndTheme(candidate, context, Number.MIN_VALUE);
        return verdict.applies ? candidate.similarity : 0;
      }),
      inputTokens: 0,
    }),
  };
}

/** O Jev ou o reranker de produção, chamados pelo `score` — o mesmo código da análise. */
export function scoredBakeoffGate(
  kind: Exclude<CardGateKind, 'threshold'>,
  gate: ScoredCardRelevanceGate,
  currentThreshold: number,
  missing: string,
): BakeoffGate {
  return {
    kind,
    name: gate.name,
    scoreKind: kind === 'jev' ? 'probability' : 'relevance',
    currentThreshold,
    usdPerMillionInputTokens: gate.usdPerMillionInputTokens,
    unavailable: () => (gate.configured() ? null : missing),
    estimateInputTokens: (candidates, context) => gate.estimateInputTokens(candidates, context),
    score: async (candidates, context) => {
      const result = await gate.score(candidates, context);
      return { scores: result.scores, inputTokens: result.inputTokens };
    },
  };
}

export type GateStopReason = 'unavailable' | 'max_usd' | 'usage_limit' | 'failures';

export interface GateRun {
  kind: CardGateKind;
  name: string;
  scoreKind: GateScoreKind;
  currentThreshold: number;
  /** Todos os pares, na ordem do arquivo; `score: null` onde o portão não julgou. */
  pairs: ScoredPair[];
  /** Uma por situação julgada (uma chamada do portão, como numa análise). */
  latenciesMs: number[];
  inputTokens: number;
  /** Algum custo saiu da estimativa (o provedor não informou os tokens). */
  costEstimated: boolean;
  costUsd: number;
  /** Situações que falharam (os pares delas ficam sem escore). */
  failures: number;
  stopped: { reason: GateStopReason; detail: string } | null;
}

export interface BakeoffOptions {
  /** Teto de gasto somado de todos os portões, em US$. */
  maxUsd: number;
  /** Falhas seguidas que param o portão: não insiste num provedor fora do ar. */
  maxConsecutiveFailures: number;
}

/** 402/429: o provedor recusou por limite de uso ou de taxa — parar, não insistir. */
function isUsageLimit(error: unknown): boolean {
  return (
    (error instanceof JevRequestError || error instanceof CardRerankerRequestError) &&
    (error.status === 402 || error.status === 429)
  );
}

/** Sem a mensagem de fora: a resposta de uma API pode ecoar o texto enviado. */
function safeError(error: unknown): string {
  if (error instanceof JevRequestError || error instanceof CardRerankerRequestError) {
    return error.message;
  }
  return error instanceof Error ? error.name : 'erro desconhecido';
}

const usd = (tokens: number, perMillion: number) => (tokens * perMillion) / 1_000_000;

export async function runBakeoff(
  groups: readonly SituationGroup[],
  cards: ReadonlyMap<string, RelevanceCard>,
  gates: readonly BakeoffGate[],
  options: BakeoffOptions,
  now: () => number = () => performance.now(),
): Promise<{ runs: GateRun[]; spentUsd: number }> {
  let spentUsd = 0;
  const runs: GateRun[] = [];

  for (const gate of gates) {
    const scores = new Map<string, number | null>();
    const run: GateRun = {
      kind: gate.kind,
      name: gate.name,
      scoreKind: gate.scoreKind,
      currentThreshold: gate.currentThreshold,
      pairs: [],
      latenciesMs: [],
      inputTokens: 0,
      costEstimated: false,
      costUsd: 0,
      failures: 0,
      stopped: null,
    };
    const unavailable = gate.unavailable();
    if (unavailable) run.stopped = { reason: 'unavailable', detail: unavailable };

    let consecutiveFailures = 0;
    for (const group of groups) {
      if (run.stopped) break;
      const candidates = group.pairs.map((pair) => ({
        // O CLI confere antes (`missingCards`) que todo par tem o cartão carregado.
        card: cards.get(pair.cardId)!,
        // Sem similaridade, NaN: o Jev e o reranker não a leem; o por limiar pula o par.
        similarity: pair.similarity ?? Number.NaN,
      }));
      const estimatedTokens = gate.estimateInputTokens(candidates, group.context);
      const estimatedUsd = usd(estimatedTokens, gate.usdPerMillionInputTokens);
      if (spentUsd + estimatedUsd > options.maxUsd) {
        run.stopped = {
          reason: 'max_usd',
          detail: `a próxima chamada (~US$ ${estimatedUsd.toFixed(6)}) passaria de --max-usd ${options.maxUsd}`,
        };
        break;
      }

      const startedAt = now();
      try {
        const result = await gate.score(candidates, group.context);
        run.latenciesMs.push(now() - startedAt);
        const tokens = result.inputTokens ?? estimatedTokens;
        run.costEstimated ||= result.inputTokens === null && gate.usdPerMillionInputTokens > 0;
        run.inputTokens += tokens;
        const cost = usd(tokens, gate.usdPerMillionInputTokens);
        run.costUsd += cost;
        spentUsd += cost;
        group.pairs.forEach((pair, index) => scores.set(pair.id, result.scores[index] ?? null));
        consecutiveFailures = 0;
      } catch (error) {
        run.failures++;
        consecutiveFailures++;
        if (isUsageLimit(error)) {
          run.stopped = { reason: 'usage_limit', detail: safeError(error) };
        } else if (consecutiveFailures >= options.maxConsecutiveFailures) {
          run.stopped = {
            reason: 'failures',
            detail: `${consecutiveFailures} falhas seguidas (última: ${safeError(error)})`,
          };
        }
      }
    }

    run.pairs = groups
      .flatMap((group) => group.pairs)
      .map((pair) => ({
        pairId: pair.id,
        cardId: pair.cardId,
        relevant: pair.label === 'relevant',
        score: scores.get(pair.id) ?? null,
      }));
    runs.push(run);
  }
  return { runs, spentUsd };
}

export interface GateSummary {
  kind: CardGateKind;
  name: string;
  scoreKind: GateScoreKind;
  judged: number;
  total: number;
  thresholdEnv: string;
  current: ThresholdMetrics;
  /** `null`: nenhum limiar atinge a precisão mínima. */
  suggested: ThresholdMetrics | null;
  meetsTarget: boolean;
  brier: number | null;
  reliability: ReliabilityBin[];
  latency: LatencySummary;
  costUsd: number;
  costEstimated: boolean;
  failures: number;
  stopped: GateRun['stopped'];
}

export function summarizeRun(run: GateRun, minPrecision: number): GateSummary {
  const suggested = chooseThreshold(run.pairs, minPrecision);
  return {
    kind: run.kind,
    name: run.name,
    scoreKind: run.scoreKind,
    judged: run.pairs.filter((pair) => pair.score !== null).length,
    total: run.pairs.length,
    thresholdEnv: CARD_GATE_THRESHOLD_ENV[run.kind],
    current: metricsAt(run.pairs, run.currentThreshold),
    suggested,
    meetsTarget: meetsTarget(suggested),
    brier: brierScore(run.pairs),
    reliability: reliabilityCurve(run.pairs),
    latency: latencySummary(run.latenciesMs),
    costUsd: run.costUsd,
    costEstimated: run.costEstimated,
    failures: run.failures,
    stopped: run.stopped,
  };
}

export interface BakeoffReportInput {
  generatedAt: string;
  pairsFile: string;
  cardsSource: string;
  pairs: number;
  relevant: number;
  /** Pares semente (sem rótulo de médico). */
  seedPairs: number;
  labelers: string[];
  minPrecision: number;
  maxUsd: number;
  spentUsd: number;
  summaries: GateSummary[];
  runs: GateRun[];
}

const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
const num = (value: number | null, digits = 3) => (value === null ? '—' : value.toFixed(digits));
const ms = (value: number | null) => (value === null ? '—' : `${Math.round(value)}`);

function rateWithInterval(metrics: ThresholdMetrics['precision']): string {
  if (metrics.rate === null) return '—';
  return `${pct(metrics.rate)} (${pct(metrics.low)}–${pct(metrics.high)})`;
}

const SCORE_KIND_NOTE: Record<GateScoreKind, string> = {
  probability: 'probabilidade calibrada',
  relevance: 'escore do reranker (sigmoide, não calibrado)',
  similarity: 'similaridade com tema/síndrome (não é probabilidade)',
};

const STOP_LABELS: Record<GateStopReason, string> = {
  unavailable: 'não rodou',
  max_usd: 'parou no teto de gasto',
  usage_limit: 'parou no limite de uso do provedor',
  failures: 'parou por falhas seguidas',
};

/** Relatório markdown do bake-off: sem texto das situações, só ids, números e limiares. */
export function renderBakeoffMarkdown(input: BakeoffReportInput): string {
  const lines: string[] = [
    '# Bake-off do portão de relevância (CC-407)',
    '',
    `Gerado em ${input.generatedAt} · pares: \`${input.pairsFile}\` · cartões: ${input.cardsSource}`,
    '',
    `- ${input.pairs} par(es): ${input.relevant} relevante(s), ${input.pairs - input.relevant} irrelevante(s)`,
    `- Rotuladores: ${input.labelers.length > 0 ? input.labelers.join(', ') : '—'}`,
    `- Precisão mínima para sugerir limiar: ${pct(input.minPrecision)} · meta da CC-407: precisão ≥ ${pct(TARGET_PRECISION)} com revocação ≥ ${pct(TARGET_RECALL)}`,
    `- Gasto: US$ ${input.spentUsd.toFixed(4)} de no máximo US$ ${input.maxUsd.toFixed(2)}`,
    '',
  ];
  if (input.seedPairs > 0) {
    lines.push(
      `> **Atenção:** ${input.seedPairs} de ${input.pairs} par(es) são semente sintética, **não rotulados por médico**. ` +
        'O resultado só mostra que o harness roda; não serve para escolher o portão nem o limiar.',
      '',
    );
  }

  lines.push(
    '## Classificação',
    '',
    '| Portão | Julgados | Limiar atual | Precisão | Revocação | F1 | Limiar sugerido | Precisão (IC 95%) | Revocação (IC 95%) | F1 | Meta |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const summary of input.summaries) {
    const head = `| ${summary.kind} (\`${summary.name}\`) | ${summary.judged}/${summary.total} | `;
    if (summary.judged === 0) {
      lines.push(
        `${head}${summary.thresholdEnv}=${num(summary.current.threshold)} | — | — | — | não rodou | — | — | — | — |`,
      );
      continue;
    }
    const suggested = summary.suggested;
    lines.push(
      head +
        `${summary.thresholdEnv}=${num(summary.current.threshold)} | ${pct(summary.current.precision.rate)} | ` +
        `${pct(summary.current.recall.rate)} | ${num(summary.current.f1)} | ` +
        (suggested
          ? `${num(suggested.threshold)} | ${rateWithInterval(suggested.precision)} | ` +
            `${rateWithInterval(suggested.recall)} | ${num(suggested.f1)} | `
          : `nenhum atinge ${pct(input.minPrecision)} | — | — | — | `) +
        `${summary.meetsTarget ? 'atinge' : 'não atinge'} |`,
    );
  }

  lines.push(
    '',
    '## Calibração, latência e custo',
    '',
    '| Portão | Escore | Brier | Latência p50 (ms) | p95 (ms) | Chamadas | Custo (US$) | Falhas | Situação |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const summary of input.summaries) {
    const stopped = summary.stopped
      ? `${STOP_LABELS[summary.stopped.reason]}: ${summary.stopped.detail}`
      : 'completo';
    lines.push(
      `| ${summary.kind} | ${SCORE_KIND_NOTE[summary.scoreKind]} | ${num(summary.brier)} | ` +
        `${ms(summary.latency.p50)} | ${ms(summary.latency.p95)} | ${summary.latency.calls} | ` +
        `${summary.costUsd.toFixed(6)}${summary.costEstimated ? ' (estimado)' : ''} | ${summary.failures} | ${stopped} |`,
    );
  }
  lines.push(
    '',
    'Latência: uma chamada do portão por situação, com todos os cartões rotulados dela — como numa análise. ' +
      'Brier: menor é melhor; 0,25 é o de quem chuta 0,5 para tudo.',
  );

  for (const summary of input.summaries) {
    if (summary.reliability.length === 0) continue;
    lines.push(
      '',
      `### Curva de calibração — ${summary.kind}`,
      '',
      '| Faixa do escore | Pares | Escore médio | Relevantes |',
      '| --- | --- | --- | --- |',
      ...summary.reliability.map(
        (bin) =>
          `| ${bin.low.toFixed(1)}–${bin.high.toFixed(1)} | ${bin.count} | ${num(bin.meanScore)} | ${pct(bin.observedRate)} |`,
      ),
    );
  }

  lines.push(
    '',
    '## Erros por par',
    '',
    'Falso positivo: cartão errado que entraria na decisão. Falso negativo: cartão certo que ficaria de fora.',
    '',
  );
  for (const summary of input.summaries) {
    if (summary.judged === 0) continue;
    const run = input.runs.find((candidate) => candidate.kind === summary.kind);
    const judgedPairs = (run?.pairs ?? []).filter(
      (pair): pair is ScoredPair & { score: number } => pair.score !== null,
    );
    const list = (selected: Array<ScoredPair & { score: number }>) =>
      selected.length === 0
        ? 'nenhum'
        : selected.map((pair) => `\`${pair.pairId}\` (${num(pair.score)})`).join(', ');
    const errorsAt = (label: string, threshold: number) =>
      `  - ${label} ${num(threshold)} — falsos positivos: ` +
      `${list(judgedPairs.filter((pair) => !pair.relevant && pair.score >= threshold))}; ` +
      `falsos negativos: ${list(judgedPairs.filter((pair) => pair.relevant && pair.score < threshold))}`;
    lines.push(`- **${summary.kind}**`, errorsAt('limiar atual', summary.current.threshold));
    if (summary.suggested) lines.push(errorsAt('limiar sugerido', summary.suggested.threshold));
  }
  lines.push('');
  return lines.join('\n');
}
