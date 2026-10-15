import type { ConfigService } from '@nestjs/config';

export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

/** Valor vazio conta como ausente: o compose repassa `${VAR:-}` como string vazia. */
export function readSetting(config: ConfigService, key: string): string | undefined {
  const value = config.get<unknown>(key);
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

function isChoice<T extends string>(value: string, choices: readonly T[]): value is T {
  return choices.some((choice) => choice === value);
}

export function readOptionalChoice<T extends string>(
  config: ConfigService,
  key: string,
  choices: readonly T[],
): T | undefined {
  const value = readSetting(config, key);
  if (value === undefined) return undefined;
  if (!isChoice(value, choices)) {
    throw new Error(`${key}="${value}" is invalid. Use one of: ${choices.join(', ')}.`);
  }
  return value;
}

export function readChoice<T extends string>(
  config: ConfigService,
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  return readOptionalChoice(config, key, choices) ?? fallback;
}

export function readFlag(config: ConfigService, key: string, fallback: boolean): boolean {
  const value = readOptionalChoice(config, key, ['true', 'false'] as const);
  return value === undefined ? fallback : value === 'true';
}

export function readMaxOutputTokens(config: ConfigService): number {
  return readNonNegativeInteger(config, 'AI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS, {
    allowZero: false,
  });
}

export function readNonNegativeInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  { allowZero }: { allowZero: boolean } = { allowZero: true },
): number {
  const value = readSetting(config, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    const expected = allowZero ? 'a non-negative integer' : 'a positive integer';
    throw new Error(`${key}="${value}" is invalid. Use ${expected}.`);
  }
  return parsed;
}
