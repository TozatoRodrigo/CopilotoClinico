import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';
import { readNumber } from './reviewed-cards.settings';

/**
 * CC-407 — qual portão de relevância decide se um cartão se aplica, lido a
 * cada análise (sem redeploy). Valor ausente ou irreconhecível = `threshold`,
 * o portão por similaridade e tema da CC-408.
 *
 * - `jev`: o Jev (TypeSafe) responde "este cartão se aplica a esta situação?"
 *   com probabilidade calibrada. Manda o entendimento mascarado e o cartão
 *   aos EUA; exige `JEV_API_KEY` e só liga depois do DPA.
 * - `reranker`: um cross-encoder no serviço de `CARD_RERANKER_URL` (na VPS)
 *   dá um escore de relevância a cada par (situação, cartão).
 *
 * Sem chave/serviço, ou com o provedor fora do ar, decide o `threshold`
 * (`CARD_GATE_FALLBACK` no log). Os limiares são provisórios até o bake-off
 * (`pnpm eval:card-gate`) com os pares rotulados pelos médicos.
 */
export const CARD_RELEVANCE_GATE_FLAG = 'CARD_RELEVANCE_GATE';
export const CARD_GATE_KINDS = ['threshold', 'jev', 'reranker'] as const;
export type CardGateKind = (typeof CARD_GATE_KINDS)[number];

export function readCardGateKind(config: ConfigService): CardGateKind {
  return readChoiceFlag(config, CARD_RELEVANCE_GATE_FLAG, CARD_GATE_KINDS, 'threshold');
}

/** A variável do limiar de cada portão: o bake-off sugere o valor dela. */
export const CARD_GATE_THRESHOLD_ENV: Record<CardGateKind, string> = {
  threshold: 'REVIEWED_CARDS_MIN_SIMILARITY',
  jev: 'CARD_GATE_JEV_MIN_PROBABILITY',
  reranker: 'CARD_GATE_RERANKER_MIN_SCORE',
};

/**
 * Probabilidade mínima de "se aplica" para o cartão entrar. Alta de
 * propósito: cartão do cenário errado na decisão (com dose liberada) é pior
 * que cartão de fora (a análise segue como antes dos cartões). A TypeSafe
 * recomenda subir o limiar quando o falso "sim" custa caro.
 */
export const DEFAULT_CARD_GATE_JEV_MIN_PROBABILITY = 0.8;

/**
 * Cross-encoder multilíngue (português incluído), servido pelo
 * text-embeddings-inference da Hugging Face. Só rótulo para o log: o serviço
 * serve um modelo só, escolhido ao subir o contêiner.
 */
export const DEFAULT_CARD_RERANKER_MODEL = 'BAAI/bge-reranker-v2-m3';
export const DEFAULT_CARD_RERANKER_TIMEOUT_MS = 2000;
/** Escore (0–1, sigmoide do cross-encoder) mínimo. Não é probabilidade calibrada. */
export const DEFAULT_CARD_GATE_RERANKER_MIN_SCORE = 0.5;

const isProbability = (value: number) => value > 0 && value <= 1;

export function readJevGateMinProbability(config: ConfigService): number {
  return readNumber(
    config,
    CARD_GATE_THRESHOLD_ENV.jev,
    DEFAULT_CARD_GATE_JEV_MIN_PROBABILITY,
    isProbability,
  );
}

export interface CardRerankerSettings {
  /** `null` sem `CARD_RERANKER_URL` (ou com URL inválida): o reranker não roda. */
  url: string | null;
  /** Opcional: Bearer, para o serviço subido com `--api-key`. */
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  minScore: number;
}

function readUrl(config: ConfigService, key: string): string | null {
  const raw = config.get<string | undefined>(key)?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? raw.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export function readCardRerankerSettings(config: ConfigService): CardRerankerSettings {
  const apiKey = config.get<string | undefined>('CARD_RERANKER_API_KEY')?.trim();
  const model = config.get<string | undefined>('CARD_RERANKER_MODEL')?.trim();
  return {
    url: readUrl(config, 'CARD_RERANKER_URL'),
    apiKey: apiKey ? apiKey : null,
    model: model ? model : DEFAULT_CARD_RERANKER_MODEL,
    timeoutMs: readNumber(
      config,
      'CARD_RERANKER_TIMEOUT_MS',
      DEFAULT_CARD_RERANKER_TIMEOUT_MS,
      (value) => Number.isInteger(value) && value >= 100 && value <= 10_000,
    ),
    minScore: readNumber(
      config,
      CARD_GATE_THRESHOLD_ENV.reranker,
      DEFAULT_CARD_GATE_RERANKER_MIN_SCORE,
      isProbability,
    ),
  };
}
