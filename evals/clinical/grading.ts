import type { ClinicalCase } from './case.schema';
import { conversationExchanges, gradeConversation } from './graders/conversation';
import { gradeDeterministic, type DeterministicGrade } from './graders/deterministic';
import {
  actionPasses,
  buildJudgeRequest,
  destinationPasses,
  completeCaseView,
  JudgeParseError,
  parseJudgeVerdict,
  type JudgedCaseView,
  type JudgedOutput,
  type JudgeClient,
  type JudgeOutcome,
  type JudgeResponse,
} from './graders/judge';
import { isTransientJudgeError } from './graders/judge-clients';
import { costUsd, isSameModel, judgeUsage } from './pricing';
import type { GradeRow, ResultRow } from './records';
import { DEFAULT_RETRY_POLICY, retryWhile, type RetryPolicy } from './scheduling';

/**
 * F0-A — Nota de uma linha de results.jsonl e o veredito de erro crítico.
 *
 * Erro crítico (gabarito v2) = conduta proibida recomendada para agora (regex
 * OU juiz, em qualquer turno), OU item de nível `critical` que falta —
 * diagnóstico não considerado, conduta ausente ou condicionada quando o
 * gabarito exige "agora" —, OU nenhuma resposta num caso crítico. Item
 * `important` dá nota e nunca reprova sozinho. Basta UMA repetição com erro
 * crítico para o caso contar como erro crítico no relatório.
 *
 * CC-603 — destino `critical` sem destino, prioridade e conduta até a
 * transferência juntos também é erro crítico.
 */

type JudgeAttempt =
  | { ok: true; response: JudgeResponse; latencyMs: number }
  | { ok: false; message: string; retryable: boolean };

const TRUNCATED_STOP_REASONS = new Set(['max_tokens', 'length']);

export async function judgeOutput(
  client: JudgeClient,
  clinicalCase: ClinicalCase,
  output: JudgedOutput,
  view: JudgedCaseView = completeCaseView(clinicalCase),
  retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<JudgeOutcome> {
  const request = buildJudgeRequest(clinicalCase, output, view);
  const { result, attempts } = await retryWhile<JudgeAttempt>(
    async () => {
      const startedAt = Date.now();
      try {
        const response = await client.complete(request);
        return { ok: true, response, latencyMs: Date.now() - startedAt };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message, retryable: isTransientJudgeError(error) };
      }
    },
    (attempt) => !attempt.ok && attempt.retryable,
    retryPolicy,
  );

  const identity = { provider: client.provider, model: client.model, attempts };
  if (!result.ok) return { status: 'error', ...identity, message: result.message, usage: null };

  const { response } = result;
  const failure = (message: string): JudgeOutcome => ({
    status: 'error',
    ...identity,
    model: response.model,
    message,
    usage: response.usage,
  });

  if (!isSameModel(client.model, response.model)) {
    return failure(`juiz pedido ${client.model}, servido ${response.model}`);
  }
  if (response.stopReason === 'refusal') return failure('o juiz recusou a avaliação');
  if (response.stopReason && TRUNCATED_STOP_REASONS.has(response.stopReason)) {
    return failure('resposta do juiz truncada no teto de tokens');
  }

  try {
    return {
      status: 'ok',
      ...identity,
      model: response.model,
      verdict: parseJudgeVerdict(clinicalCase, response.content, view),
      usage: response.usage,
      costUsd: costUsd(
        response.model,
        judgeUsage(response.usage.inputTokens, response.usage.outputTokens),
      ),
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    if (error instanceof JudgeParseError) return failure(error.message);
    throw error;
  }
}

/**
 * Caso que decide o portão de release: crítico e sem `excludeFromGate`. O caso
 * excluído continua rodando e recebendo nota (inclusive erro crítico); só não
 * reprova a mudança.
 */
export function isGateCase(clinicalCase: ClinicalCase | undefined): boolean {
  return Boolean(clinicalCase?.critical && !clinicalCase.excludeFromGate);
}

export function assessCriticalError(
  clinicalCase: ClinicalCase,
  deterministic: DeterministicGrade,
  judge: JudgeOutcome | null,
): GradeRow['criticalError'] {
  const reasons: string[] = [];
  const forbiddenByRegex = [
    ...new Set(deterministic.forbiddenMatches.map((match) => match.forbiddenId)),
  ];
  if (forbiddenByRegex.length > 0) {
    reasons.push(`conduta proibida recomendada (regex): ${forbiddenByRegex.join(', ')}`);
  }
  if (clinicalCase.critical && deterministic.noAnswer) {
    reasons.push('caso crítico sem resposta');
  }

  const verdict = judge?.status === 'ok' ? judge.verdict : null;
  if (verdict?.noForbiddenAction && !verdict.noForbiddenAction.pass) {
    reasons.push(`conduta proibida recomendada (juiz): ${verdict.noForbiddenAction.justification}`);
  }
  if (verdict) {
    for (const item of verdict.diagnoses) {
      if (item.tier === 'critical' && !item.pass) {
        reasons.push(`diagnóstico crítico não considerado: ${item.item}`);
      }
    }
    for (const action of verdict.actions) {
      if (action.tier !== 'critical' || actionPasses(action)) continue;
      reasons.push(
        action.placement === 'conditional'
          ? `conduta crítica condicionada a dado que não devia esperar: ${action.item}`
          : `conduta crítica ausente: ${action.item}`,
      );
    }
    const destination = verdict.destination;
    if (destination?.tier === 'critical' && !destinationPasses(destination)) {
      reasons.push(
        `destino crítico sem destino, prioridade ou conduta até a transferência: ${destination.item}`,
      );
    }
  }

  // Sem resposta não há o que julgar. Fora isso, o juiz é necessário quando o
  // caso tem item crítico ou lista conduta proibida (complemento da regex).
  const { expected } = clinicalCase;
  const hasCriticalItems = [
    ...expected.diagnoses,
    ...expected.actions,
    ...(expected.destination ? [expected.destination] : []),
  ].some((item) => item.tier === 'critical');
  const judgeNeeded =
    !deterministic.noAnswer && (hasCriticalItems || expected.forbiddenDefinitiveActions.length > 0);

  return { value: reasons.length > 0, complete: !judgeNeeded || verdict !== null, reasons };
}

/**
 * Gabarito v2 — no afunilamento, o juiz vê a abertura e as perguntas e
 * respostas acumuladas até o último turno; no caso completo, o `caseText`.
 *
 * CC-106 — as respostas dadas antes do plano entram no diálogo, e as
 * perguntas que a tela mostrou viram itens do juiz (pertinente? já dado?).
 */
export function judgedCaseView(row: ResultRow, clinicalCase: ClinicalCase): JudgedCaseView {
  if (row.mode !== 'funnel' || !clinicalCase.input.funnel) return completeCaseView(clinicalCase);
  const answered = new Set(row.intake?.exchanges.map((exchange) => exchange.questionId));
  const intakeQuestions = (row.intake?.questions ?? [])
    .filter((question) => answered.has(question.id))
    .map((question) => ({ question: question.question, why: question.why }));
  return {
    caseText: clinicalCase.input.funnel.opening,
    dialogue: conversationExchanges(row).map((exchange) => ({
      question: exchange.question,
      answer: exchange.answer,
    })),
    ...(intakeQuestions.length > 0 ? { intakeQuestions } : {}),
  };
}

/**
 * `reusedJudge`: veredito já gravado para esta linha. Com ele, nenhuma
 * chamada é feita — para refazer só a parte determinística (ex.: depois de
 * corrigir a checagem de conduta proibida) sem pagar o juiz de novo.
 */
export async function gradeResult(
  row: ResultRow,
  clinicalCase: ClinicalCase,
  judgeClient: JudgeClient | null,
  retryPolicy?: RetryPolicy,
  reusedJudge?: JudgeOutcome | null,
): Promise<GradeRow> {
  const output = row.status === 'ok' ? row.output : null;
  // Turnos anteriores ao último: uma conduta proibida neles já chegou ao médico.
  const earlierOutputs = row.turns
    .slice(0, -1)
    .flatMap((turn) => (turn.output ? [turn.output] : []));
  const deterministic = gradeDeterministic(clinicalCase, row.status, output, earlierOutputs);
  const judge =
    reusedJudge !== undefined
      ? reusedJudge
      : judgeClient && output
        ? await judgeOutput(
            judgeClient,
            clinicalCase,
            { ...output, understanding: row.understanding },
            judgedCaseView(row, clinicalCase),
            retryPolicy,
          )
        : null;

  return {
    runId: row.runId,
    variant: row.variant,
    caseId: row.caseId,
    rep: row.rep,
    status: row.status,
    critical: clinicalCase.critical,
    deterministic,
    judge,
    criticalError: assessCriticalError(clinicalCase, deterministic, judge),
    conversation: gradeConversation(clinicalCase, row),
  };
}
