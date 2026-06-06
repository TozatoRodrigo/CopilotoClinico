interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface CalculateInferenceCostParams {
  model: string;
  usage: TokenUsage;
}

interface ModelPrice {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
}

const FALLBACK_TOTAL_TOKEN_PRICE_PER_TOKEN = 0.00001;

const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-3-sonnet': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'claude-3-5-sonnet': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'claude-3-5-sonnet-latest': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'claude-sonnet-4-20250514': { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
  'gpt-4o': { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10 },
  'gpt-4o-mini': { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6 },
};

export function calculateInferenceCost(params: CalculateInferenceCostParams): number {
  const price = MODEL_PRICES[params.model];

  if (!price) {
    return roundCost(params.usage.totalTokens * FALLBACK_TOTAL_TOKEN_PRICE_PER_TOKEN);
  }

  const inputCost = (params.usage.promptTokens / 1_000_000) * price.inputPerMillionTokens;
  const outputCost = (params.usage.completionTokens / 1_000_000) * price.outputPerMillionTokens;

  return roundCost(inputCost + outputCost);
}

function roundCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
