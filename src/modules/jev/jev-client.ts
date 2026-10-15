import type { Provider } from '@nestjs/common';
import { z } from 'zod';

/**
 * Cliente mínimo do Jev (TypeSafe, "System One"), escrito a partir da
 * documentação pública (docs.typesafe.ai: quickstart, `/api`,
 * `/primitives/choice` e `/primitives/noul`, conferida em 15/10/2026).
 * Nenhum teste chama a API: o `fetch` é injetado.
 *
 * Usado pela guarda de escopo da pergunta rápida (CC-503, Choice) e pelo
 * portão de relevância dos cartões (CC-407, Noul).
 *
 * Contrato usado:
 * - `POST {base}/v1/systemone`, `Authorization: Bearer <chave>`, JSON.
 * - Corpo: `{ state, model, questions }`; `state` é texto ou objeto JSON.
 *   - `choice`: `{ type: 'choice', instructions, criteria: { opção: descrição } }`
 *     (até 255 opções) → `{ type: 'choice', choice, probabilities, confidence }`.
 *   - `noul` (sim/não): `{ type: 'noul', instructions, criteria?: { true, false } }`
 *     → `{ type: 'noul', noul }`, a probabilidade de "sim" (0–1).
 * - Resposta: `{ model, answers: { <id>: … }, usage: { input_tokens, output_tokens } }`.
 * - Erros: 400/422 (pedido inválido), 401 (chave), 413, 415, 429 (limite),
 *   529 (sobrecarga). A documentação não descreve o corpo do erro.
 *
 * O acesso antecipado ainda não foi confirmado: o contrato precisa ser
 * conferido contra a API de verdade antes de ligar o Jev em qualquer fluxo.
 */

/** `fetch` injetável: os testes nunca chamam a TypeSafe. */
export const JEV_FETCH = Symbol('JEV_FETCH');

/** O `fetch` de verdade, para os módulos que usam o Jev. */
export const JEV_FETCH_PROVIDER: Provider = {
  provide: JEV_FETCH,
  useFactory: (): typeof fetch => globalThis.fetch.bind(globalThis),
};

/** O que o Jev avalia: texto ou um objeto JSON (até 64 níveis). */
export type JevState = string | { readonly [key: string]: unknown };

export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Opção → descrição; a resposta volta com uma destas chaves. */
  criteria: Record<string, string | null>;
}

export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
  /** Opcional: o que conta como "sim" e como "não", quando a fronteira é sutil. */
  criteria?: { true: string; false: string };
}

export interface JevChoiceAnswer {
  choice: string;
  /** Probabilidade de cada opção; somam 1. */
  probabilities: Record<string, number>;
  /** 0–1: pico único = alta; probabilidade espalhada = baixa. */
  confidence: number;
}

/** Metadados de toda chamada: o que vai para o log e para o custo. */
interface JevCallMeta {
  /** Versão servida (ex.: `jev-1.13.0`). */
  model: string;
  inputTokens: number | null;
  latencyMs: number;
}

export interface JevChoiceResult extends JevCallMeta {
  answer: JevChoiceAnswer;
}

export interface JevNoulResult extends JevCallMeta {
  /** Probabilidade de "sim", calibrada pela TypeSafe (0–1). */
  probability: number;
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

const noulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
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
    state: JevState,
    questionId: string,
    question: JevChoiceQuestion,
  ): Promise<JevChoiceResult> {
    const { answer, status, meta } = await this.ask(state, questionId, question);
    const parsed = choiceAnswerSchema.safeParse(answer);
    if (!parsed.success || !Object.hasOwn(question.criteria, parsed.data.choice)) {
      throw new JevRequestError('invalid_response', status);
    }
    return {
      answer: {
        choice: parsed.data.choice,
        probabilities: parsed.data.probabilities,
        confidence: parsed.data.confidence,
      },
      ...meta,
    };
  }

  /** Uma pergunta sim/não (`noul`) sobre `state`. Mesmas falhas de `choose`. */
  async noul(
    state: JevState,
    questionId: string,
    question: JevNoulQuestion,
  ): Promise<JevNoulResult> {
    const { answer, status, meta } = await this.ask(state, questionId, question);
    const parsed = noulAnswerSchema.safeParse(answer);
    if (!parsed.success) throw new JevRequestError('invalid_response', status);
    return { probability: parsed.data.noul, ...meta };
  }

  /** A chamada HTTP e o envelope da resposta; a resposta da pergunta volta sem validar. */
  private async ask(
    state: JevState,
    questionId: string,
    question: JevChoiceQuestion | JevNoulQuestion,
  ): Promise<{ answer: unknown; status: number; meta: JevCallMeta }> {
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
    if (!parsed.success) throw new JevRequestError('invalid_response', response.status);

    return {
      answer: parsed.data.answers[questionId],
      status: response.status,
      meta: {
        model: parsed.data.model,
        inputTokens: parsed.data.usage?.input_tokens ?? null,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
