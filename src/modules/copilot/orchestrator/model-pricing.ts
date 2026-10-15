import type { CompletionUsage } from '../../ai-gateway/providers/provider.interface';

interface CalculateInferenceCostParams {
  model: string;
  usage: CompletionUsage;
}

/** Preços em USD por milhão de tokens. Cache sem preço próprio é cobrado como entrada comum. */
interface ModelPrice {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  cacheReadPerMillionTokens?: number;
  cacheWritePerMillionTokens?: number;
}

const FALLBACK_TOTAL_TOKEN_PRICE_PER_TOKEN = 0.00001;
/**
 * F1 — web search da Anthropic: US$ 10 por 1.000 buscas, além dos tokens
 * (docs da ferramenta, 11/10/2026). Web fetch não tem cobrança própria.
 */
export const WEB_SEARCH_PRICE_PER_REQUEST = 10 / 1000;
// Multiplicadores padrão da Anthropic: leitura de cache ~0,1x da entrada e
// escrita com TTL de 5 minutos 1,25x (skill claude-api, shared/prompt-caching.md).
const CLAUDE_CACHE_READ_MULTIPLIER = 0.1;
const CLAUDE_CACHE_WRITE_MULTIPLIER = 1.25;
const DATED_SNAPSHOT_SUFFIX = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;

function claudePrice(
  inputPerMillionTokens: number,
  outputPerMillionTokens: number,
  cacheReadPerMillionTokens = inputPerMillionTokens * CLAUDE_CACHE_READ_MULTIPLIER,
): ModelPrice {
  return {
    inputPerMillionTokens,
    outputPerMillionTokens,
    cacheReadPerMillionTokens,
    cacheWritePerMillionTokens: inputPerMillionTokens * CLAUDE_CACHE_WRITE_MULTIPLIER,
  };
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-3-sonnet': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'claude-3-5-sonnet': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'claude-3-5-sonnet-latest': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'claude-sonnet-4-20250514': claudePrice(3, 15),
  // Geração atual (skill claude-api, tabela de modelos em 2026-10-06). Os
  // modelos de fallback de recusa (Opus 5, Opus 4.8, Sonnet 5) também entram:
  // quando o fallback responde, `model` volta com o id dele.
  'claude-fable-5-1': claudePrice(10, 50, 0.25),
  'claude-fable-5': claudePrice(10, 50),
  'claude-opus-5-5': claudePrice(4, 20, 0.2),
  'claude-opus-5': claudePrice(5, 25),
  'claude-opus-4-8': claudePrice(5, 25),
  'claude-opus-4-7': claudePrice(5, 25),
  'claude-opus-4-6': claudePrice(5, 25),
  'claude-sonnet-5-5': claudePrice(2, 10, 0.2),
  'claude-sonnet-5': claudePrice(2, 10),
  'claude-sonnet-4-6': claudePrice(3, 15),
  // Até 100K tokens de prompt; acima disso a Anthropic cobra $0,50/$2,50.
  'claude-haiku-5-5': claudePrice(0.1, 0.5),
  'claude-haiku-4-5': claudePrice(1, 5),
  'gpt-4o': { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10 },
  'gpt-4o-mini': { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6 },
  // F0-A — candidatos ao modelo de produção, conferidos na página oficial
  // (developers.openai.com/api/docs/pricing, tier Standard, contexto curto) em
  // 10/10/2026. Cache = "cached input" da OpenAI.
  'gpt-4.1': {
    inputPerMillionTokens: 2,
    outputPerMillionTokens: 8,
    cacheReadPerMillionTokens: 0.5,
  },
  'gpt-4.1-mini': {
    inputPerMillionTokens: 0.4,
    outputPerMillionTokens: 1.6,
    cacheReadPerMillionTokens: 0.1,
  },
  'gpt-5': {
    inputPerMillionTokens: 1.25,
    outputPerMillionTokens: 10,
    cacheReadPerMillionTokens: 0.125,
  },
  'gpt-5-mini': {
    inputPerMillionTokens: 0.25,
    outputPerMillionTokens: 2,
    cacheReadPerMillionTokens: 0.025,
  },
  // Modelo de produção em 10/10/2026 (AI_MODEL do .env.production).
  'gpt-5.6-luna': {
    inputPerMillionTokens: 0.2,
    outputPerMillionTokens: 1.2,
    cacheReadPerMillionTokens: 0.02,
  },
  // Groq (console.groq.com/docs/models, 13/10/2026), com o id que a Groq
  // devolve. Cache com 50% de desconto nos gpt-oss.
  'openai/gpt-oss-120b': {
    inputPerMillionTokens: 0.15,
    outputPerMillionTokens: 0.6,
    cacheReadPerMillionTokens: 0.075,
  },
  'openai/gpt-oss-20b': {
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 0.3,
    cacheReadPerMillionTokens: 0.0375,
  },
  'qwen/qwen3.8-27b': { inputPerMillionTokens: 0.8, outputPerMillionTokens: 4 },
};

/** A OpenAI devolve o snapshot datado (`gpt-4o-2024-08-06`); o preço é o do alias. */
function findPrice(model: string): ModelPrice | undefined {
  return MODEL_PRICES[model] ?? MODEL_PRICES[model.replace(DATED_SNAPSHOT_SUFFIX, '')];
}

/**
 * F0-A — sem preço, `calculateInferenceCost` cai numa taxa genérica por
 * token. Serve para não zerar o custo em produção, mas o gabarito clínico
 * compara custo entre modelos e precisa dizer "desconhecido" em vez de usar
 * um número inventado.
 */
export function hasModelPrice(model: string): boolean {
  return findPrice(model) !== undefined;
}

export function calculateInferenceCost(params: CalculateInferenceCostParams): number {
  const { usage } = params;
  const price = findPrice(params.model);
  const webSearchCost = (usage.webSearchRequests ?? 0) * WEB_SEARCH_PRICE_PER_REQUEST;

  if (!price) {
    return roundCost(usage.totalTokens * FALLBACK_TOTAL_TOKEN_PRICE_PER_TOKEN + webSearchCost);
  }

  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const uncachedInputTokens = Math.max(usage.promptTokens - cacheReadTokens - cacheWriteTokens, 0);

  const costPerMillion =
    uncachedInputTokens * price.inputPerMillionTokens +
    cacheReadTokens * (price.cacheReadPerMillionTokens ?? price.inputPerMillionTokens) +
    cacheWriteTokens * (price.cacheWritePerMillionTokens ?? price.inputPerMillionTokens) +
    usage.completionTokens * price.outputPerMillionTokens;

  return roundCost(costPerMillion / 1_000_000 + webSearchCost);
}

function roundCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
