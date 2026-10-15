import { Inject, Injectable, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  readCardRerankerSettings,
  type CardRerankerSettings,
} from './card-relevance-gate.settings';

/**
 * CC-407 — reranker do portão de relevância: dá a cada documento (cartão) um
 * escore de relevância para a consulta (situação). Atrás de interface para
 * trocar o fornecedor (Voyage `rerank-2.5`, Cohere `rerank`, outro
 * cross-encoder) sem mexer no portão.
 */
export interface CardRerankResult {
  /** Um escore por documento, na ordem recebida; maior = mais relevante. */
  scores: number[];
  model: string;
  /** `null`: o serviço não informa (o local não cobra por token). */
  inputTokens: number | null;
  latencyMs: number;
}

export interface CardReranker {
  /** Com o serviço no ambiente, o reranker pode rodar. */
  configured(): boolean;
  /** US$ por milhão de tokens de entrada: o bake-off estima e freia o gasto. */
  readonly usdPerMillionInputTokens: number;
  /** Lança `CardRerankerRequestError` em qualquer falha (sem o corpo da resposta). */
  rerank(query: string, documents: readonly string[]): Promise<CardRerankResult>;
}

export const CARD_RERANKER = Symbol('CARD_RERANKER');

/** `fetch` injetável: os testes nunca chamam o serviço. */
export const CARD_RERANKER_FETCH = Symbol('CARD_RERANKER_FETCH');

export const CARD_RERANKER_FETCH_PROVIDER: Provider = {
  provide: CARD_RERANKER_FETCH,
  useFactory: (): typeof fetch => globalThis.fetch.bind(globalThis),
};

/** Erro do reranker sem o corpo da resposta: status e classe bastam. */
export class CardRerankerRequestError extends Error {
  constructor(
    readonly kind: 'unconfigured' | 'http' | 'timeout' | 'network' | 'invalid_response',
    readonly status: number | null,
  ) {
    super(`Reranker ${kind}${status !== null ? ` ${status}` : ''}`);
    this.name = 'CardRerankerRequestError';
  }
}

/** Documentos por chamada: o `--max-client-batch-size` padrão do TEI é 32. */
export const TEI_RERANK_BATCH_SIZE = 32;

const teiRerankResponseSchema = z.array(
  z.object({ index: z.number().int().min(0), score: z.number().min(0).max(1) }),
);

/**
 * CC-407 — a implementação escolhida: um cross-encoder local
 * (`BAAI/bge-reranker-v2-m3`, multilíngue) servido pelo
 * text-embeddings-inference (TEI) da Hugging Face num contêiner na VPS.
 *
 * Por que este e não Voyage ou Cohere: nada sai da VPS (nenhum DPA novo,
 * nenhum contrato a assinar), não há custo por token e o mesmo servidor pode
 * servir o embedding local que a CC-406 também mede (`bge-m3`). O custo é um
 * contêiner a mais (~2–3 GB de RAM, CPU).
 *
 * Contrato do TEI: `POST {url}/rerank` com `{ query, texts, raw_scores: false,
 * truncate: true }` → `[{ index, score }]` ordenado por escore; com
 * `raw_scores: false` o escore é a sigmoide do logit (0–1), monótona mas não
 * calibrada — o limiar sai do bake-off.
 */
@Injectable()
export class TeiCardReranker implements CardReranker {
  readonly usdPerMillionInputTokens = 0;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CARD_RERANKER_FETCH) private readonly fetchImpl: typeof fetch,
  ) {}

  configured(): boolean {
    return readCardRerankerSettings(this.config).url !== null;
  }

  async rerank(query: string, documents: readonly string[]): Promise<CardRerankResult> {
    const settings = readCardRerankerSettings(this.config);
    const { url } = settings;
    if (!url) throw new CardRerankerRequestError('unconfigured', null);
    const startedAt = Date.now();
    const scores: number[] = [];
    for (let start = 0; start < documents.length; start += TEI_RERANK_BATCH_SIZE) {
      const batch = documents.slice(start, start + TEI_RERANK_BATCH_SIZE);
      scores.push(...(await this.rerankBatch({ ...settings, url }, query, batch)));
    }
    return { scores, model: settings.model, inputTokens: null, latencyMs: Date.now() - startedAt };
  }

  private async rerankBatch(
    settings: CardRerankerSettings & { url: string },
    query: string,
    texts: readonly string[],
  ): Promise<number[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${settings.url}/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({ query, texts, raw_scores: false, truncate: true }),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new CardRerankerRequestError(aborted ? 'timeout' : 'network', null);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new CardRerankerRequestError('http', response.status);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CardRerankerRequestError('invalid_response', response.status);
    }
    const parsed = teiRerankResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.length !== texts.length) {
      throw new CardRerankerRequestError('invalid_response', response.status);
    }
    const scores = new Array<number | undefined>(texts.length);
    for (const { index, score } of parsed.data) {
      if (index >= texts.length || scores[index] !== undefined) {
        throw new CardRerankerRequestError('invalid_response', response.status);
      }
      scores[index] = score;
    }
    // Tantos itens quanto textos, índices únicos e na faixa: nenhum ficou vazio.
    return scores as number[];
  }
}
