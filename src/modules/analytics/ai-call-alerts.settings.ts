import type { ConfigService } from '@nestjs/config';

/** CC-005 — limiares dos alertas de `ai_calls`. `null` = alerta desligado. */
export interface AiCallAlertThresholds {
  /** Teto do custo do dia (UTC), em USD. */
  dailyCostUsd: number | null;
  /** Meta do p95 de latência da etapa `decision` na última hora, em ms. */
  decisionP95Ms: number | null;
}

export const DAILY_COST_ALERT_KEY = 'AI_DAILY_COST_ALERT_USD';
export const DECISION_P95_ALERT_KEY = 'AI_P95_ALERT_MS';

interface ThresholdReading {
  value: number | null;
  invalid: boolean;
}

/** Número maior que zero; ausente ou vazio desliga, e o resto também (mas avisa). */
function readThreshold(config: ConfigService, key: string): ThresholdReading {
  const raw = config.get<string | number | undefined>(key);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { value: null, invalid: false };
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0
    ? { value, invalid: false }
    : { value: null, invalid: true };
}

/**
 * Lidos a cada verificação. Valor inválido desliga o alerta como se a variável
 * estivesse ausente; `invalidKeys` diz quais, para o aviso no log.
 */
export function readAiCallAlertThresholds(config: ConfigService): {
  thresholds: AiCallAlertThresholds;
  invalidKeys: string[];
} {
  const dailyCost = readThreshold(config, DAILY_COST_ALERT_KEY);
  const decisionP95 = readThreshold(config, DECISION_P95_ALERT_KEY);
  return {
    thresholds: { dailyCostUsd: dailyCost.value, decisionP95Ms: decisionP95.value },
    invalidKeys: [
      ...(dailyCost.invalid ? [DAILY_COST_ALERT_KEY] : []),
      ...(decisionP95.invalid ? [DECISION_P95_ALERT_KEY] : []),
    ],
  };
}
