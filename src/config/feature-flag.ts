import type { ConfigService } from '@nestjs/config';

const FALSE_VALUES = ['false', '0', 'off', 'no'];
const TRUE_VALUES = ['true', '1', 'on', 'yes'];

/**
 * Flag booleana lida do ambiente a cada chamada, para ligar/desligar sem
 * redeploy. Ausente, vazia ou irreconhecível cai no default: um typo na env
 * nunca muda o comportamento em silêncio — em especial, nunca desliga uma
 * proteção clínica que é ligada por padrão.
 */
export function readBooleanFlag(
  config: ConfigService,
  key: string,
  defaultValue: boolean,
): boolean {
  return parseBooleanFlag(config.get<string | boolean | undefined>(key), defaultValue);
}

/**
 * A regra de `readBooleanFlag` sobre um valor já lido — para função pura que
 * lê `process.env` porque não tem ConfigService (ex.: a máscara de PII, usada
 * por vários serviços).
 */
export function parseBooleanFlag(raw: unknown, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null) return defaultValue;

  const normalized = String(raw).trim().toLowerCase();
  if (FALSE_VALUES.includes(normalized)) return false;
  if (TRUE_VALUES.includes(normalized)) return true;
  return defaultValue;
}

/**
 * F1 — flag de várias opções lida a cada chamada (ex.: `COPILOT_REASONING`).
 * Mesma regra de `readBooleanFlag`: ausente, vazia ou fora da lista cai no
 * default, sem lançar — um typo nunca derruba a análise nem liga um caminho
 * que ainda não foi aprovado. Comparação sem caixa e sem espaços.
 */
export function readChoiceFlag<T extends string>(
  config: ConfigService,
  key: string,
  choices: readonly T[],
  defaultValue: T,
): T {
  const raw = config.get<string | undefined>(key);
  if (raw === undefined || raw === null) return defaultValue;

  const normalized = String(raw).trim().toLowerCase();
  return choices.find((choice) => choice.toLowerCase() === normalized) ?? defaultValue;
}
