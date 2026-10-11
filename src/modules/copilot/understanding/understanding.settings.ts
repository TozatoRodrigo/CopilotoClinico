import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';
import { AI_EFFORTS, type AiEffort } from '../../ai-gateway/providers/provider.interface';

/**
 * F1 — configuração do raciocínio em etapas (ADR-013), lida a cada análise.
 * Também usada pelo gabarito clínico para registrar no run.json o que a
 * variante rodou de fato.
 */

export const REASONING_MODES = ['legacy', 'stages'] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];

/**
 * `COPILOT_REASONING`: `legacy` (padrão) é o pipeline de sempre, byte a byte;
 * `stages` entende o caso antes de buscar. Typo cai em `legacy`: um valor
 * errado nunca liga um caminho que o gabarito ainda não aprovou.
 */
export function readReasoningMode(config: ConfigService): ReasoningMode {
  return readChoiceFlag(config, 'COPILOT_REASONING', REASONING_MODES, 'legacy');
}

/** `AI_UNDERSTANDING_MODEL`; vazio = `undefined`, e o gateway usa o `AI_MODEL`. */
export function readUnderstandingModel(config: ConfigService): string | undefined {
  const configured = config.get<string | undefined>('AI_UNDERSTANDING_MODEL')?.trim();
  return configured ? configured : undefined;
}

/** `AI_UNDERSTANDING_EFFORT`, baixo por padrão: meta de ≤ 10 s até o entendimento. */
export function readUnderstandingEffort(config: ConfigService): AiEffort {
  return readChoiceFlag(config, 'AI_UNDERSTANDING_EFFORT', AI_EFFORTS, 'low');
}
