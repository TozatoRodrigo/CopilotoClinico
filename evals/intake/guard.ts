import { z } from 'zod';
import { AiRefusalError, AiTruncatedError } from '../../src/modules/ai-gateway/ai-gateway.errors';

/**
 * CC-104 — freios da rodada. A avaliação usa o mesmo workspace da Anthropic
 * que a produção, e já o esgotou duas vezes (11/10 e 14/10/2026): a rodada
 * para no teto de gasto e na primeira resposta de limite de uso, antes que
 * a produção fique sem modelo.
 */

export const StopReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('budget'), maxUsd: z.number(), spentUsd: z.number() }),
  /** O provedor disse que a conta chegou ao limite de uso (ou de crédito). */
  z.object({ kind: z.literal('usage_limit'), model: z.string(), detail: z.string() }),
  /** 429 que continuou depois das novas tentativas do harness. */
  z.object({ kind: z.literal('rate_limit'), model: z.string() }),
]);

export type StopReason = z.infer<typeof StopReasonSchema>;

/** Lançado no lugar da chamada quando a rodada já parou: nenhuma requisição sai. */
export class EvalStoppedError extends Error {
  override readonly name = 'EvalStoppedError';

  constructor(readonly reason: StopReason) {
    super(`Rodada interrompida (${reason.kind}): nenhuma chamada nova ao modelo.`);
  }
}

export class SpendGuard {
  private spent = 0;
  private reason: StopReason | null = null;

  constructor(readonly maxUsd: number) {}

  get spentUsd(): number {
    return this.spent;
  }

  get stopReason(): StopReason | null {
    return this.reason;
  }

  /**
   * Antes de cada chamada. O teto é conferido aqui e a cada gasto somado: com
   * N casos em paralelo, a rodada pode passar do teto em até N chamadas que
   * já estavam em voo.
   */
  assertCanCall(): void {
    if (!this.reason && this.spent >= this.maxUsd) this.stop(this.budgetReason());
    if (this.reason) throw new EvalStoppedError(this.reason);
  }

  addSpend(usd: number): void {
    this.spent += usd;
    if (this.spent >= this.maxUsd) this.stop(this.budgetReason());
  }

  /** O primeiro motivo fica: é ele que explica a rodada. */
  stop(reason: StopReason): void {
    this.reason ??= reason;
  }

  private budgetReason(): StopReason {
    return { kind: 'budget', maxUsd: this.maxUsd, spentUsd: this.spent };
  }
}

export const PROVIDER_FAILURES = [
  'usage_limit',
  'rate_limit',
  'server_error',
  'refusal',
  'truncated',
  'stopped',
  'other',
] as const;
export type ProviderFailure = (typeof PROVIDER_FAILURES)[number];

/**
 * Anthropic: "You have reached your specified workspace API usage limits"
 * (400) e "Your credit balance is too low" (400).
 */
const USAGE_LIMIT_MESSAGE = /usage limits?|credit balance is too low/i;
/** O provedor compatível com a OpenAI lança só "AI provider error: <status>". */
const STATUS_IN_MESSAGE = /\b(?:error|status)[:=]\s*(\d{3})\b/i;
const NETWORK_MESSAGE = /network error|timeout|ECONNRESET|ETIMEDOUT|socket hang up/i;

function statusOf(error: Error): number | null {
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') return status;
  const match = STATUS_IN_MESSAGE.exec(error.message);
  return match?.[1] ? Number(match[1]) : null;
}

export function classifyProviderError(error: unknown): ProviderFailure {
  if (error instanceof EvalStoppedError) return 'stopped';
  if (error instanceof AiRefusalError) return 'refusal';
  if (error instanceof AiTruncatedError) return 'truncated';
  if (!(error instanceof Error)) return 'other';
  if (USAGE_LIMIT_MESSAGE.test(error.message)) return 'usage_limit';
  const status = statusOf(error);
  if (status === 429) return 'rate_limit';
  if ((status !== null && status >= 500) || NETWORK_MESSAGE.test(error.message)) {
    return 'server_error';
  }
  return 'other';
}

/** Classe e status do erro (ex.: `RateLimitError:429`), como no rastro ai_calls; nunca a mensagem. */
export function errorTypeOf(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const status = statusOf(error);
  return status === null ? error.name : `${error.name}:${status}`;
}
