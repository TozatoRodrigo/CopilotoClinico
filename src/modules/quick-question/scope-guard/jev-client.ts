import { z } from 'zod';

/**
 * CC-503 — cliente mínimo do Jev (TypeSafe, "System One"), escrito a partir
 * da documentação pública (docs.typesafe.ai: quickstart, `/api` e
 * `/primitives/choice`, conferida em 15/10/2026). Nenhum teste chama a API:
 * o `fetch` é injetado.
 *
 * Contrato usado:
 * - `POST {base}/v1/systemone`, `Authorization: Bearer <chave>`, JSON.
 * - Corpo: `{ state, model, questions }`; uma pergunta `choice` é
 *   `{ type: 'choice', instructions, criteria: { opção: descrição } }`
 *   (até 255 opções).
 * - Resposta: `{ model, answers: { <id>: { type: 'choice', choice,
 *   probabilities, confidence } }, usage: { input_tokens, output_tokens } }`.
 * - Erros: 400/422 (pedido inválido), 401 (chave), 413, 415, 429 (limite),
 *   529 (sobrecarga). A documentação não descreve o corpo do erro.
 *
 * O acesso antecipado ainda não foi confirmado: o contrato precisa ser
 * conferido contra a API de verdade antes de ligar `QUICK_QUESTION_SCOPE_GUARD=jev`.
 */

export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Opção → descrição; a resposta volta com uma destas chaves. */
  criteria: Record<string, string | null>;
}

export interface JevChoiceAnswer {
  choice: string;
  /** Probabilidade de cada opção; somam 1. */
  probabilities: Record<string, number>;
  /** 0–1: pico único = alta; probabilidade espalhada = baixa. */
  confidence: number;
}

export interface JevChoiceResult {
  answer: JevChoiceAnswer;
  /** Versão servida (ex.: `jev-1.13.0`). */
  model: string;
  inputTokens: number | null;
  latencyMs: number;
}

export interface JevClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetch: typeof fetch;
}

const choiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string().min(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1),
});

const systemOneResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  usage: z
    .object({ input_tokens: z.number().int().min(0), output_tokens: z.number().int().min(0) })
    .partial()
    .optional(),
});

/** Erro do Jev sem o corpo da resposta (pode ecoar o `state`): status e classe bastam. */
export class JevRequestError extends Error {
  constructor(
    readonly kind: 'http' | 'timeout' | 'network' | 'invalid_response',
    readonly status: number | null,
  ) {
    super(`Jev ${kind}${status !== null ? ` ${status}` : ''}`);
    this.name = 'JevRequestError';
  }
}

export class JevClient {
  constructor(private readonly options: JevClientOptions) {}

  /**
   * Uma pergunta `choice` sobre `state`. Lança `JevRequestError` em qualquer
   * falha — status HTTP, tempo esgotado, rede ou resposta fora do contrato —
   * e quando a escolha não é uma das opções pedidas.
   */
  async choose(
    state: string,
    questionId: string,
    question: JevChoiceQuestion,
  ): Promise<JevChoiceResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let response: Response;
    try {
      response = await this.options.fetch(`${this.options.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state,
          model: this.options.model,
          questions: { [questionId]: question },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new JevRequestError(aborted ? 'timeout' : 'network', null);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new JevRequestError('http', response.status);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new JevRequestError('invalid_response', response.status);
    }
    const parsed = systemOneResponseSchema.safeParse(body);
    const answer = parsed.success
      ? choiceAnswerSchema.safeParse(parsed.data.answers[questionId])
      : null;
    if (
      !parsed.success ||
      !answer?.success ||
      !Object.hasOwn(question.criteria, answer.data.choice)
    ) {
      throw new JevRequestError('invalid_response', response.status);
    }

    return {
      answer: {
        choice: answer.data.choice,
        probabilities: answer.data.probabilities,
        confidence: answer.data.confidence,
      },
      model: parsed.data.model,
      inputTokens: parsed.data.usage?.input_tokens ?? null,
      latencyMs: Date.now() - startedAt,
    };
  }
}
