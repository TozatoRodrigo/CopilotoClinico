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
  const raw = config.get<string | boolean | undefined>(key);
  if (raw === undefined || raw === null) return defaultValue;

  const normalized = String(raw).trim().toLowerCase();
  if (FALSE_VALUES.includes(normalized)) return false;
  if (TRUE_VALUES.includes(normalized)) return true;
  return defaultValue;
}
