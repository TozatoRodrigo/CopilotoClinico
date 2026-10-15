import type { CompletionUsage } from '../../src/modules/ai-gateway/providers/provider.interface';
import {
  calculateInferenceCost,
  hasModelPrice,
} from '../../src/modules/copilot/orchestrator/model-pricing';

/**
 * F0-A — Custo pela MESMA tabela do pipeline (model-pricing.ts), a partir dos
 * tokens devolvidos pelo provedor e do modelo que de fato serviu a chamada.
 * Modelo sem preço fica `null` ("desconhecido" no relatório): a taxa genérica
 * que o pipeline usa como rede de segurança inventaria um número justamente na
 * comparação de custo entre modelos.
 */
export function costUsd(model: string, usage: CompletionUsage): number | null {
  return hasModelPrice(model) ? calculateInferenceCost({ model, usage }) : null;
}

/** Usage do juiz (SDK/API) no formato do gateway, para usar a mesma tabela. */
export function judgeUsage(inputTokens: number, outputTokens: number): CompletionUsage {
  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * O provedor pode devolver um snapshot (`gpt-4o-2024-08-06` para `gpt-4o`),
 * mas nunca outro modelo. Nota dada por modelo trocado não mede nada.
 */
export function isSameModel(requested: string, served: string): boolean {
  return served === requested || served.startsWith(`${requested}-`);
}
