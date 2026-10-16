import type { ConfigService } from '@nestjs/config';
import {
  AiProviderError,
  AiRefusalError,
  AiTruncatedError,
  type AiUnavailabilityReason,
} from './ai-gateway.errors';
import { readSetting } from './ai-gateway.settings';
import type { AiCallStage } from './ai-call-trace';
import { anthropicUnavailabilityOf } from './providers/anthropic.provider';

/**
 * CC-107 — reserva de provedor. Quando o provedor de uma etapa fica fora do
 * ar, o gateway repete a chamada UMA vez no modelo de reserva da etapa
 * (`AI_<ETAPA>_FALLBACK_MODEL`) ou, sem ele, no de `AI_FALLBACK_MODEL`. Sem
 * nenhum dos dois, nada muda. Aceita `perfil:modelo`, como os modelos das etapas.
 */
export const FALLBACK_MODEL_KEY = 'AI_FALLBACK_MODEL';

/** Valor que desliga a reserva numa etapa mesmo com `AI_FALLBACK_MODEL` configurado. */
export const FALLBACK_DISABLED = 'none';

/**
 * A variável de cada etapa segue o nome da variável do modelo dela
 * (`AI_INTAKE_MODEL` → `AI_INTAKE_FALLBACK_MODEL`). A pesquisa web só existe
 * na Anthropic e não passa pela reserva; `other` só usa a reserva geral.
 */
const STAGE_FALLBACK_KEYS: Readonly<Record<AiCallStage, string | null>> = {
  intake_reading: 'AI_INTAKE_FALLBACK_MODEL',
  understanding: 'AI_UNDERSTANDING_FALLBACK_MODEL',
  decision: 'AI_DECISION_FALLBACK_MODEL',
  verify_attach: 'AI_VERIFY_ATTACH_FALLBACK_MODEL',
  guideline_classification: 'AI_GUIDELINE_CLASSIFICATION_FALLBACK_MODEL',
  research: null,
  other: null,
};

/** Referência do modelo de reserva da etapa; `undefined` = sem reserva. Lida a cada chamada. */
export function readFallbackModel(config: ConfigService, stage: AiCallStage): string | undefined {
  const stageKey = STAGE_FALLBACK_KEYS[stage];
  const configured =
    (stageKey === null ? undefined : readSetting(config, stageKey)) ??
    readSetting(config, FALLBACK_MODEL_KEY);
  if (configured === undefined || configured.toLowerCase() === FALLBACK_DISABLED) return undefined;
  return configured;
}

/**
 * Só a indisponibilidade aciona a reserva. Recusa, truncamento, 400 de
 * schema, chave errada e saída inválida são problemas do pedido: outro
 * provedor não os resolveria, e repetir só dobraria custo e espera.
 */
export function unavailabilityOf(error: unknown): AiUnavailabilityReason | null {
  if (error instanceof AiProviderError) return error.details.unavailability;
  return anthropicUnavailabilityOf(error);
}

/**
 * A reserva também falhou. Recusa e truncamento da reserva são respostas do
 * modelo dela, com o custo que quem chama contabiliza: seguem como estão. Os
 * demais erros dão lugar ao original, que é o que explica a falha da etapa.
 */
export function errorAfterFailedFallback(original: unknown, fallbackError: unknown): unknown {
  return fallbackError instanceof AiRefusalError || fallbackError instanceof AiTruncatedError
    ? fallbackError
    : original;
}
