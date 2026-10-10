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
};

/** A OpenAI devolve o snapshot datado (`gpt-4o-2024-08-06`); o preço é o do alias. */
function findPrice(model: string): ModelPrice | undefined {
  return MODEL_PRICES[model] ?? MODEL_PRICES[model.replace(DATED_SNAPSHOT_SUFFIX, '')];
}

export function calculateInferenceCost(params: CalculateInferenceCostParams): number {
  const { usage } = params;
  const price = findPrice(params.model);

  if (!price) {
    return roundCost(usage.totalTokens * FALLBACK_TOTAL_TOKEN_PRICE_PER_TOKEN);
  }

  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const uncachedInputTokens = Math.max(usage.promptTokens - cacheReadTokens - cacheWriteTokens, 0);

  const costPerMillion =
    uncachedInputTokens * price.inputPerMillionTokens +
    cacheReadTokens * (price.cacheReadPerMillionTokens ?? price.inputPerMillionTokens) +
    cacheWriteTokens * (price.cacheWritePerMillionTokens ?? price.inputPerMillionTokens) +
    usage.completionTokens * price.outputPerMillionTokens;

  return roundCost(costPerMillion / 1_000_000);
}

function roundCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
