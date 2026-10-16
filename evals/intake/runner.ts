import {
  backoffDelayMs,
  mapWithConcurrency,
  withTimeout,
  type RetryDependencies,
  type RetryPolicy,
} from '../clinical/scheduling';
import type { IntakeCase } from './case.schema';
import type { SpendGuard, StopReason } from './guard';
import type { ReadAttempt, ReadCase } from './reader';
import type { CallRecord, ReadingRow } from './records';

export interface EvalTask {
  model: string;
  intakeCase: IntakeCase;
  rep: number;
}

/**
 * Intercala os modelos caso a caso (repetição → caso → modelo): todos medem
 * no mesmo horário e com a mesma carga do provedor, e uma rodada
 * interrompida ainda compara os modelos nos casos que chegou a ler.
 */
export function planTasks(
  models: readonly string[],
  cases: readonly IntakeCase[],
  reps: number,
): EvalTask[] {
  const tasks: EvalTask[] = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const intakeCase of cases) {
      for (const model of models) tasks.push({ model, intakeCase, rep });
    }
  }
  return tasks;
}

/**
 * Limite de taxa e erro de servidor refazem a leitura inteira, com espera.
 * Os provedores compatíveis com a OpenAI rodam sem as novas tentativas deles
 * (AI_REQUEST_MAX_RETRIES=0 em run.ts): a espera nunca entra na latência.
 * Esperas de até um minuto cobrem a janela por minuto do plano gratuito da Groq.
 */
export const INTAKE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 5_000,
  maxDelayMs: 60_000,
};

const realRetryDependencies: RetryDependencies = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

export interface RunnerDeps {
  read: ReadCase;
  guard: SpendGuard;
  /** Cada linha assim que sai, para gravar e mostrar o progresso. */
  onRow?: (row: ReadingRow, finished: number, total: number) => void;
}

export interface RunnerOptions {
  concurrency: number;
  caseTimeoutMs: number;
  retryPolicy?: RetryPolicy;
  retryDependencies?: RetryDependencies;
}

export interface RunnerResult {
  rows: ReadingRow[];
  /** Tarefas que nem começaram porque a rodada parou. */
  skipped: number;
  stop: StopReason | null;
}

function toRow(
  task: EvalTask,
  attempts: number,
  attempt: Omit<ReadAttempt, 'calls'> | null,
  calls: CallRecord[],
): ReadingRow {
  const key = { model: task.model, caseId: task.intakeCase.id, rep: task.rep, attempts, calls };
  if (!attempt) {
    return {
      ...key,
      outcome: 'timeout',
      failure: null,
      servedModel: null,
      readingMs: null,
      firstQuestionMs: null,
      questions: [],
      fields: null,
      piiDetected: false,
    };
  }
  return {
    ...key,
    outcome: attempt.outcome,
    failure: attempt.failure,
    servedModel: attempt.servedModel,
    readingMs: attempt.readingMs,
    firstQuestionMs: attempt.firstQuestionMs,
    questions: attempt.questions,
    fields: attempt.fields,
    piiDetected: attempt.piiDetected,
  };
}

async function runTask(
  task: EvalTask,
  deps: RunnerDeps,
  options: RunnerOptions,
): Promise<ReadingRow> {
  const policy = options.retryPolicy ?? INTAKE_RETRY_POLICY;
  const retry = options.retryDependencies ?? realRetryDependencies;
  const calls: CallRecord[] = [];

  for (let attempts = 1; ; attempts++) {
    // A chamada abandonada pelo teto continua no provedor; o freio soma o gasto dela quando chegar.
    const timed = await withTimeout(deps.read(task.model, task.intakeCase), options.caseTimeoutMs);
    if (timed.timedOut) return toRow(task, attempts, null, calls);

    const attempt = timed.value;
    calls.push(...attempt.calls);
    const retryable = attempt.failure === 'rate_limit' || attempt.failure === 'server_error';
    if (!retryable || deps.guard.stopReason) return toRow(task, attempts, attempt, calls);
    if (attempts >= policy.maxAttempts) {
      // 429 depois de todas as esperas: a cota acabou (ex.: tokens por dia da Groq).
      if (attempt.failure === 'rate_limit') {
        deps.guard.stop({ kind: 'rate_limit', model: task.model });
      }
      return toRow(task, attempts, attempt, calls);
    }
    await retry.sleep(backoffDelayMs(attempts, policy, retry.random));
  }
}

export async function runIntakeEval(
  tasks: readonly EvalTask[],
  deps: RunnerDeps,
  options: RunnerOptions,
): Promise<RunnerResult> {
  let skipped = 0;
  let finished = 0;
  const results = await mapWithConcurrency(tasks, options.concurrency, async (task) => {
    if (deps.guard.stopReason) {
      skipped++;
      return null;
    }
    const row = await runTask(task, deps, options);
    finished++;
    deps.onRow?.(row, finished, tasks.length);
    return row;
  });
  return {
    rows: results.filter((row): row is ReadingRow => row !== null),
    skipped,
    stop: deps.guard.stopReason,
  };
}
