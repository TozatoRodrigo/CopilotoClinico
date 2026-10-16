import { performance } from 'node:perf_hooks';
import type { WhisperModel } from '../../src/modules/audio/whisper.settings';
import { mapWithConcurrency } from '../clinical/scheduling';
import type { AudioSample } from './dataset';
import { billedCostUsd } from './pricing';

/**
 * CC-205 — roda cada áudio por cada modelo com três freios: teto de gasto
 * (`maxUsd`), parada no primeiro limite de uso ou chave recusada, e poucas
 * chamadas em paralelo. Sem retry: tentativa extra custa e, num limite de uso,
 * só gasta o que sobrou da cota. O workspace da Groq é o mesmo da produção.
 */

/** `limit`: 429/402, cota ou limite de taxa. `auth`: chave recusada (401/403). */
export type FailureKind = 'limit' | 'auth' | 'other';
export type StopReason = 'limit' | 'auth' | 'budget';

/** Erro de transcrição já classificado; o transcritor traduz o erro do provedor nisto. */
export class TranscriptionFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status: number | null,
  ) {
    super(`transcrição falhou (${kind}${status === null ? '' : `, HTTP ${status}`})`);
  }
}

export interface Transcriber {
  transcribe(sample: AudioSample, model: WhisperModel): Promise<string>;
}

export type CallOutcome =
  | {
      kind: 'ok';
      id: string;
      model: WhisperModel;
      transcript: string;
      latencyMs: number;
      costUsd: number;
    }
  | {
      kind: 'error';
      id: string;
      model: WhisperModel;
      failure: FailureKind;
      status: number | null;
      /** Mensagem do erro (nunca texto transcrito: quando há erro, não há texto). */
      message: string;
      latencyMs: number;
    }
  | { kind: 'skipped'; id: string; model: WhisperModel };

export interface RunResult {
  outcomes: CallOutcome[];
  stop: { reason: StopReason; id: string; model: WhisperModel } | null;
  /** Custo das chamadas feitas, com ou sem sucesso: é o que o teto controla. */
  spentUsd: number;
}

export interface RunOptions {
  models: readonly WhisperModel[];
  maxUsd: number;
  concurrency: number;
  onOutcome?: (outcome: CallOutcome, done: number, total: number) => void;
  now?: () => number;
}

/** Folga de arredondamento: um plano exatamente no teto não pode parar na última chamada. */
const BUDGET_EPSILON_USD = 1e-9;

export async function runTranscriptions(
  samples: readonly AudioSample[],
  transcriber: Transcriber,
  options: RunOptions,
): Promise<RunResult> {
  const now = options.now ?? (() => performance.now());
  // Um arquivo por vez, com todos os modelos em seguida: se a execução parar
  // no meio, os modelos ficam com os mesmos arquivos e a comparação segue justa.
  const calls = samples.flatMap((sample) => options.models.map((model) => ({ sample, model })));
  let stop: RunResult['stop'] = null;
  let spentUsd = 0;
  let done = 0;

  async function call(sample: AudioSample, model: WhisperModel): Promise<CallOutcome> {
    const { id } = sample;
    if (stop) return { kind: 'skipped', id, model };
    const costUsd = billedCostUsd(model, sample.durationSec);
    if (spentUsd + costUsd > options.maxUsd + BUDGET_EPSILON_USD) {
      stop = { reason: 'budget', id, model };
      return { kind: 'skipped', id, model };
    }
    // Reservado antes da chamada: chamadas em paralelo não passam do teto juntas.
    spentUsd += costUsd;

    const started = now();
    try {
      const transcript = await transcriber.transcribe(sample, model);
      return { kind: 'ok', id, model, transcript, latencyMs: now() - started, costUsd };
    } catch (error) {
      const latencyMs = now() - started;
      const failure = error instanceof TranscriptionFailure ? error : null;
      const kind = failure?.kind ?? 'other';
      if (kind !== 'other' && stop === null) stop = { reason: kind, id, model };
      const message = error instanceof Error ? error.message.slice(0, 200) : String(error);
      return {
        kind: 'error',
        id,
        model,
        failure: kind,
        status: failure?.status ?? null,
        message,
        latencyMs,
      };
    }
  }

  const outcomes = await mapWithConcurrency(
    calls,
    options.concurrency,
    async ({ sample, model }) => {
      const outcome = await call(sample, model);
      done += 1;
      options.onOutcome?.(outcome, done, calls.length);
      return outcome;
    },
  );
  return { outcomes, stop, spentUsd };
}
