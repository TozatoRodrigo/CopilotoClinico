import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { readBooleanFlag } from '../../../config/feature-flag';
import {
  CASE_SCORES_PROVENANCE,
  caseScoreFacts,
  computeCaseScore,
  describeMissing,
  findScoreCitations,
  reportedScores,
  sameScoreValue,
  scoreItemCount,
  suggestedCalculatorIds,
  type CaseScoreFacts,
  type CaseScoreResult,
  type ScoreCitation,
} from '../../../shared/clinical-tools/case-scores';
import {
  suggestCaseTools,
  type CaseReading,
} from '../../../shared/clinical-tools/case-suggestions';
import { formatCompact } from '../../../shared/clinical-tools/numbers';
import {
  SCORE_CHECK_OUTCOMES,
  type DeterministicScores,
  type ScoreCitationCheck,
  type SystemScore,
} from '../../../shared/contracts/clinical';
import type { CopilotOutput } from '../guardrails/output-validator';

/**
 * CC-333 — o escore citado no plano vem do motor das Ferramentas, não do
 * modelo. Duas camadas, as duas atrás de `COPILOT_DETERMINISTIC_SCORES`
 * (padrão `off`; desligada, prompt e saída ficam byte a byte iguais):
 *
 * 1. Pré-cálculo, antes da decisão: as calculadoras que a CC-332 sugere para
 *    o caso e que têm todas as entradas no caso são calculadas pelo motor e
 *    entram no prompt como fato, com as entradas usadas; as que não têm,
 *    entram com o que falta. O modelo é instruído a nunca calcular escore.
 * 2. Verificação, depois da decisão: todo escore do catálogo citado com
 *    número é conferido com o motor (ou com o valor que o próprio caso
 *    informa). Divergiu, o número vira o do motor; sem dado para calcular, o
 *    número sai e o texto pede o dado. É correção determinística, como a da
 *    pergunta sobre dado já informado na v3: nunca pede retry.
 *
 * Por que não "tool use" (o modelo chamando a calculadora): ADR-017, adendo
 * ao item 11.
 */
export const DETERMINISTIC_SCORES_FLAG = 'COPILOT_DETERMINISTIC_SCORES';

export function deterministicScoresEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, DETERMINISTIC_SCORES_FLAG, false);
}

export interface CaseScoreContext {
  facts: CaseScoreFacts;
  /** Escores que o texto do caso informa (Glasgow do médico, resultado anexado de ferramenta). */
  reported: ReadonlyMap<string, number>;
  /** Calculadoras sugeridas pela CC-332: calculadas ou com o que falta. */
  precomputed: CaseScoreResult[];
}

/**
 * O que a decisão do turno recebe e contra o que a saída é conferida.
 * `reading` é o entendimento do turno (ou a leitura do Copiloto guiado);
 * sem ele, nada é pré-calculado e a conferência só tem o que o texto traz.
 */
export function caseScoreContext(reading: CaseReading | null, caseText: string): CaseScoreContext {
  const facts = caseScoreFacts(reading, caseText);
  const reported = reportedScores(caseText);
  const suggested = reading
    ? suggestedCalculatorIds(suggestCaseTools({ reading, caseText, planActions: [] }))
    : [];
  const precomputed = suggested
    .flatMap((id) => {
      const result = computeCaseScore(id, facts);
      return result ? [result] : [];
    })
    // O caso já diz o valor (o médico escreveu o Glasgow): não há o que pedir.
    .filter((result) => result.status === 'complete' || !reported.has(result.calculatorId));
  return { facts, reported, precomputed };
}

type CompleteScore = Extract<CaseScoreResult, { status: 'complete' }>;
type IncompleteScore = Extract<CaseScoreResult, { status: 'incomplete' }>;

const isComplete = (result: CaseScoreResult | null | undefined): result is CompleteScore =>
  result?.status === 'complete';

/** "CURB-65 = 5 pontos, calculado pelo sistema com: …" — a mesma frase no prompt e no plano. */
export function systemScoreSentence(score: CompleteScore | SystemScore): string {
  const name = 'label' in score ? score.label : score.name;
  return `${name} = ${score.valueText}, calculado pelo sistema com: ${score.inputs.join('; ')}`;
}

function missingSentence(score: IncompleteScore): string {
  return `${score.label}: falta saber ${describeMissing(score.missing, scoreItemCount(score.calculatorId))}`;
}

const SCORE_RULE_PREFIX =
  'SCORE RULE: never compute or estimate a clinical score yourself (CURB-65, qSOFA, NEWS2, HEART, Wells, CHA₂DS₂-VASc and the like).';
const SCORE_RULE_SUFFIX =
  'For any other score, write no number: write "Falta saber: <the missing data> para calcular <score>", and ask for that data only when it changes the conduct.';

/**
 * Bloco do fim da mensagem do usuário (mesmo lugar da instrução de último
 * turno), para o system prompt continuar igual e cacheável. Só leva rótulos
 * das definições e números: nenhum texto livre do caso entra aqui.
 */
export function scoreInstructions(context: CaseScoreContext): string {
  const computed = context.precomputed.filter(isComplete);
  const incomplete = context.precomputed.filter(
    (result): result is IncompleteScore => result.status === 'incomplete',
  );
  if (computed.length === 0 && incomplete.length === 0) {
    return `${SCORE_RULE_PREFIX} Cite a score only with a value the physician wrote in the case. ${SCORE_RULE_SUFFIX}`;
  }
  return [
    '<system_scores type="COMPUTED_BY_THE_SYSTEM_FROM_CASE_DATA">',
    ...(computed.length > 0
      ? [
          "Computed by the system's calculator engine from the data in this case:",
          ...computed.map((score) => `- ${systemScoreSentence(score)}`),
        ]
      : []),
    ...(incomplete.length > 0
      ? [
          'Not computed, because the case lacks the data:',
          ...incomplete.map((score) => `- ${missingSentence(score)}`),
        ]
      : []),
    '</system_scores>',
    `${SCORE_RULE_PREFIX} Cite a score only with a value given in <system_scores>, exactly as given and without restating its inputs (the system attaches them), or with a value the physician wrote in the case. ${SCORE_RULE_SUFFIX}`,
  ].join('\n');
}

// ── Verificação depois da decisão ────────────────────────────────────────

/** Onde a lista de entradas vai: na própria conduta ou, fora delas, no raciocínio. */
type Owner = { kind: 'recommendation'; index: number } | { kind: 'other' };

interface Verification {
  context: CaseScoreContext;
  engine: Map<string, CaseScoreResult | null>;
  checks: ScoreCitationCheck[];
  /** Escores do motor citados, por conduta (índice) e fora delas (`other`). */
  cited: Map<number | 'other', Set<string>>;
}

function engineScore(state: Verification, calculatorId: string): CaseScoreResult | null {
  if (!state.engine.has(calculatorId)) {
    state.engine.set(calculatorId, computeCaseScore(calculatorId, state.context.facts));
  }
  return state.engine.get(calculatorId) ?? null;
}

function checkCitation(
  state: Verification,
  citation: ScoreCitation,
  field: string,
): ScoreCitationCheck {
  const base = { calculatorId: citation.calculatorId, field, cited: citation.value };
  const engine = engineScore(state, citation.calculatorId);
  if (isComplete(engine)) {
    return {
      ...base,
      outcome: sameScoreValue(citation, engine.value) ? 'match' : 'corrected',
      reference: { source: 'engine', value: engine.value },
      missing: [],
    };
  }
  const reported = state.context.reported.get(citation.calculatorId);
  if (reported !== undefined) {
    return {
      ...base,
      outcome: sameScoreValue(citation, reported) ? 'match' : 'corrected',
      reference: { source: 'case', value: reported },
      missing: [],
    };
  }
  return {
    ...base,
    outcome: 'missing_inputs',
    reference: null,
    missing: engine?.status === 'incomplete' ? engine.missing : [],
  };
}

const CORRECTED_MARK: Record<'engine' | 'case', string> = {
  engine: ' [corrigido pelo sistema]',
  case: ' [corrigido pelo sistema: valor informado no caso]',
};

/** O trecho da citação depois da conferência. */
function rewrittenCitation(
  text: string,
  citation: ScoreCitation,
  check: ScoreCitationCheck,
): string {
  const original = text.slice(citation.start, citation.end);
  if (check.outcome === 'match') return original;
  if (check.outcome === 'missing_inputs' || check.reference === null) {
    const missing =
      check.missing.length > 0
        ? describeMissing(check.missing, scoreItemCount(check.calculatorId))
        : 'os dados';
    return `${citation.nameText} [falta saber: ${missing} para calcular]`;
  }
  const value = check.reference.value;
  const points = citation.points
    ? citation.points.text.replace(/pontos?/i, value === 1 ? 'ponto' : 'pontos')
    : '';
  const afterValue = citation.points ? citation.points.end : citation.valueEnd;
  return (
    text.slice(citation.start, citation.valueStart) +
    formatCompact(value) +
    points +
    text.slice(afterValue, citation.end) +
    CORRECTED_MARK[check.reference.source]
  );
}

function rewrite(state: Verification, text: string, field: string, owner: Owner): string {
  const citations = findScoreCitations(text);
  if (citations.length === 0) return text;
  const checks = citations.map((citation) => checkCitation(state, citation, field));
  state.checks.push(...checks);

  const ownerKey = owner.kind === 'recommendation' ? owner.index : 'other';
  for (const check of checks) {
    if (check.reference?.source !== 'engine') continue;
    const cited = state.cited.get(ownerKey) ?? new Set<string>();
    cited.add(check.calculatorId);
    state.cited.set(ownerKey, cited);
  }

  // Do fim para o começo: os índices das citações anteriores continuam valendo.
  let result = text;
  for (let index = citations.length - 1; index >= 0; index -= 1) {
    const citation = citations[index];
    const check = checks[index];
    if (!citation || !check) continue;
    result =
      result.slice(0, citation.start) +
      rewrittenCitation(result, citation, check) +
      result.slice(citation.end);
  }
  return result;
}

/** " [CURB-65 = 5 pontos, calculado pelo sistema com: …]" para cada escore do motor citado. */
function withInputs(state: Verification, text: string, calculatorIds: ReadonlySet<string>): string {
  let result = text;
  for (const calculatorId of calculatorIds) {
    const score = state.engine.get(calculatorId);
    if (!isComplete(score)) continue;
    const listing = `[${systemScoreSentence(score)}]`;
    if (!result.includes(listing)) result = `${result} ${listing}`;
  }
  return result;
}

function toSystemScore(score: CompleteScore): SystemScore {
  return {
    calculatorId: score.calculatorId,
    name: score.label,
    value: score.value,
    valueText: score.valueText,
    band: score.band,
    inputs: score.inputs,
  };
}

export interface ScoreVerification {
  output: CopilotOutput;
  scores: DeterministicScores;
}

/**
 * Confere todo escore citado com número na saída da decisão. Texto sem escore
 * fica igual. Roda na saída já validada (depois do retry, quando houve): não
 * acrescenta retry nem bloqueia a resposta.
 */
export function verifyScoreCitations(
  output: CopilotOutput,
  context: CaseScoreContext,
): ScoreVerification {
  const state: Verification = { context, engine: new Map(), checks: [], cited: new Map() };
  const other: Owner = { kind: 'other' };
  const rw = (text: string, field: string, owner: Owner = other) =>
    rewrite(state, text, field, owner);
  const rwOptional = (text: string | null | undefined, field: string, owner: Owner = other) =>
    typeof text === 'string' ? rw(text, field, owner) : text;

  const reasoning = rw(output.reasoning, 'reasoning');
  const redFlags = output.redFlags.map((flag, index) => ({
    ...flag,
    finding: rw(flag.finding, `redFlags[${index}].finding`),
    action: rw(flag.action, `redFlags[${index}].action`),
  }));
  const recommendations = output.recommendations.map((rec, index) => {
    const owner: Owner = { kind: 'recommendation', index };
    const action = rw(rec.action, `recommendations[${index}].action`, owner);
    const rationale = rw(rec.rationale, `recommendations[${index}].rationale`, owner);
    const dependsOn = rwOptional(rec.dependsOn, `recommendations[${index}].dependsOn`, owner);
    return {
      ...rec,
      action,
      rationale: withInputs(state, rationale, state.cited.get(index) ?? new Set()),
      ...(dependsOn !== rec.dependsOn ? { dependsOn } : {}),
    };
  });
  const differentials = output.differentials.map((differential, index) => ({
    ...differential,
    hypothesis: rw(differential.hypothesis, `differentials[${index}].hypothesis`),
    whyConsider: rw(differential.whyConsider, `differentials[${index}].whyConsider`),
    whatDistinguishes: rw(
      differential.whatDistinguishes,
      `differentials[${index}].whatDistinguishes`,
    ),
  }));
  const clarifyingQuestions = output.clarifyingQuestions.map((question, index) => ({
    ...question,
    question: rw(question.question, `clarifyingQuestions[${index}].question`),
    why: rw(question.why, `clarifyingQuestions[${index}].why`),
  }));
  const uncertaintyReason = rwOptional(output.uncertaintyReason, 'uncertaintyReason') ?? null;

  const computed = new Map<string, SystemScore>();
  for (const result of [...context.precomputed, ...state.engine.values()]) {
    if (isComplete(result)) computed.set(result.calculatorId, toSystemScore(result));
  }

  return {
    output: {
      ...output,
      // Escore do motor citado fora das condutas: as entradas vão no raciocínio.
      reasoning: withInputs(state, reasoning, state.cited.get('other') ?? new Set()),
      redFlags,
      recommendations,
      differentials,
      clarifyingQuestions,
      uncertaintyReason,
    },
    scores: {
      version: CASE_SCORES_PROVENANCE.version,
      computed: [...computed.values()],
      checks: state.checks,
    },
  };
}

// ── Log ──────────────────────────────────────────────────────────────────

/** Linhas de log sem texto clínico: ids das calculadoras, campo e contagem. */
export function describePrecomputed(context: CaseScoreContext, logLabel: string): string {
  const ids = (status: CaseScoreResult['status']) =>
    context.precomputed
      .filter((result) => result.status === status)
      .map((result) => result.calculatorId)
      .join(',') || '-';
  return `SCORE_PRECOMPUTED${logLabel} computed=${ids('complete')} incomplete=${ids('incomplete')}`;
}

export function describeScoreChecks(scores: DeterministicScores, logLabel: string): string[] {
  return scores.checks.flatMap((check) => {
    if (check.outcome === 'corrected') {
      return [
        `SCORE_CORRECTED${logLabel} calculator=${check.calculatorId} field=${check.field} reference=${check.reference?.source ?? '-'}`,
      ];
    }
    if (check.outcome === 'missing_inputs') {
      return [
        `SCORE_INPUTS_MISSING${logLabel} calculator=${check.calculatorId} field=${check.field} missing=${check.missing.length}`,
      ];
    }
    return [];
  });
}

/** Releitura do que foi gravado (gabarito clínico): mesmo formato do contrato. */
export const DeterministicScoresSchema = z.object({
  version: z.string(),
  computed: z.array(
    z.object({
      calculatorId: z.string(),
      name: z.string(),
      value: z.number(),
      valueText: z.string(),
      band: z.string(),
      inputs: z.array(z.string()),
    }),
  ),
  checks: z.array(
    z.object({
      calculatorId: z.string(),
      field: z.string(),
      cited: z.number(),
      outcome: z.enum(SCORE_CHECK_OUTCOMES),
      reference: z.object({ source: z.enum(['engine', 'case']), value: z.number() }).nullable(),
      missing: z.array(z.string()),
    }),
  ),
}) satisfies z.ZodType<DeterministicScores>;
