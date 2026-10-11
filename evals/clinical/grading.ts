import type { ClinicalCase } from './case.schema';
import { gradeDeterministic, type DeterministicGrade } from './graders/deterministic';
import {
  buildJudgeRequest,
  JudgeParseError,
  parseJudgeVerdict,
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
 * Erro crítico = conduta proibida recomendada como definitiva (regex OU
 * juiz), OU hipótese "não pode errar" ausente num caso crítico, OU nenhuma
 * resposta num caso crítico. Basta UMA repetição com erro crítico para o
 * caso contar como erro crítico no relatório.
 */

type JudgeAttempt =
  | { ok: true; response: JudgeResponse; latencyMs: number }
  | { ok: false; message: string; retryable: boolean };

const TRUNCATED_STOP_REASONS = new Set(['max_tokens', 'length']);

export async function judgeOutput(
  client: JudgeClient,
  clinicalCase: ClinicalCase,
  output: JudgedOutput,
  retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<JudgeOutcome> {
  const request = buildJudgeRequest(clinicalCase, output);
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
      verdict: parseJudgeVerdict(clinicalCase, response.content),
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
  if (clinicalCase.critical && verdict) {
    for (const item of verdict.cannotMiss.filter((candidate) => !candidate.pass)) {
      reasons.push(`hipótese não considerada: ${item.item}`);
    }
  }

  // Sem resposta não há o que julgar. Fora isso, o juiz é necessário quando o
  // caso é crítico (cannotMiss) ou lista conduta proibida (complemento da regex).
  const judgeNeeded =
    !deterministic.noAnswer &&
    (clinicalCase.critical || clinicalCase.expected.forbiddenDefinitiveActions.length > 0);

  return { value: reasons.length > 0, complete: !judgeNeeded || verdict !== null, reasons };
}

export async function gradeResult(
  row: ResultRow,
  clinicalCase: ClinicalCase,
  judgeClient: JudgeClient | null,
  retryPolicy?: RetryPolicy,
): Promise<GradeRow> {
  const output = row.status === 'ok' ? row.output : null;
  const deterministic = gradeDeterministic(clinicalCase, row.status, output);
  const judge =
    judgeClient && output
      ? await judgeOutput(
          judgeClient,
          clinicalCase,
          { ...output, understanding: row.understanding },
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
  };
}
