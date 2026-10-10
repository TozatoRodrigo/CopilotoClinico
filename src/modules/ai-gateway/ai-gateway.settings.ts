import type { ConfigService } from '@nestjs/config';

export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

/** Valor vazio conta como ausente: o compose repassa `${VAR:-}` como string vazia. */
function readSetting(config: ConfigService, key: string): string | undefined {
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
  const value = readSetting(config, 'AI_MAX_OUTPUT_TOKENS');
  if (value === undefined) return DEFAULT_MAX_OUTPUT_TOKENS;
  const maxTokens = Number(value);
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new Error(`AI_MAX_OUTPUT_TOKENS="${value}" is invalid. Use a positive integer.`);
  }
  return maxTokens;
}
