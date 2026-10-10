/**
 * F0-A — Custo calculado pelo gabarito a partir dos tokens que o provedor
 * devolveu e do modelo que de fato serviu a chamada.
 *
 * Existe porque `metadata.cost` do pipeline (model-pricing.ts) só conhece
 * modelos antigos e cobra uma taxa genérica do resto — para claude-opus-5-5
 * o número seria inventado, e o bake-off compara justamente custo. O
 * relatório mostra os dois; modelo sem preço aqui fica "desconhecido", nunca
 * estimado.
 *
 * Preços em US$ por milhão de tokens. Conferir antes de usar o número numa
 * decisão: Claude conforme a tabela da Anthropic consultada em 06/10/2026;
 * OpenAI conforme src/modules/copilot/orchestrator/model-pricing.ts.
 */
const PRICES_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/**
 * O provedor pode devolver um snapshot datado (`gpt-4o-2024-08-06`). Vale o
 * prefixo MAIS LONGO, para `gpt-4o-mini-...` não cair no preço do `gpt-4o`.
 */
function priceFor(model: string): { input: number; output: number } | null {
  const key = Object.keys(PRICES_PER_MILLION_TOKENS)
    .filter((candidate) => model === candidate || model.startsWith(`${candidate}-`))
    .sort((left, right) => right.length - left.length)[0];
  return key ? (PRICES_PER_MILLION_TOKENS[key] ?? null) : null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** `null` quando não há preço para o modelo. */
export function costUsd(model: string, usage: TokenUsage): number | null {
  const price = priceFor(model);
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/**
 * O provedor pode devolver um snapshot (`gpt-4o-2024-08-06` para `gpt-4o`),
 * mas nunca outro modelo. Nota dada por modelo trocado não mede nada.
 */
export function isSameModel(requested: string, served: string): boolean {
  return served === requested || served.startsWith(`${requested}-`);
}
