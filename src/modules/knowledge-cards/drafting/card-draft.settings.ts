import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../../../config/feature-flag';
import type { AiEffort } from '../../ai-gateway/providers/provider.interface';

/**
 * CC-403 — rascunho de cartões por IA. Lido a cada pedido, sem redeploy.
 *
 * Desligado por padrão: cada pedido custa uma chamada ao modelo (estimativa
 * do CC-403: US$ 0,20–0,30 por cartão) e o workspace da IA é o mesmo da
 * produção. Ligar é decisão de quem vai revisar os cartões.
 */
export const CARD_DRAFT_FLAG = 'KNOWLEDGE_CARDS_DRAFT_ENABLED';

export function isCardDraftEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, CARD_DRAFT_FLAG, false);
}

/**
 * `AI_CARD_DRAFT_MODEL` (aceita `perfil:modelo`); vazio usa `AI_MODEL`. O
 * rascunho copia trechos e doses literalmente — a checagem de citação pega o
 * modelo que parafraseia, então vale testar um modelo menor antes do maior.
 */
export function readCardDraftModel(config: ConfigService): string | undefined {
  const configured = config.get<string | undefined>('AI_CARD_DRAFT_MODEL')?.trim();
  return configured ? configured : undefined;
}

/** Copiar e organizar trechos não pede raciocínio longo; a qualidade vem da checagem. */
export const CARD_DRAFT_EFFORT: AiEffort = 'medium';

/** Trechos entregues por pedido quando o tema escolhe as fontes pela consulta de diretrizes. */
export const DEFAULT_DRAFT_SOURCES = 8;
