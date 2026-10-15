import type { ConfigService } from '@nestjs/config';

/**
 * Conexão com o Jev (TypeSafe), lida a cada chamada (sem redeploy). A mesma
 * para a guarda de escopo (CC-503) e o portão de relevância (CC-407); cada
 * fluxo tem a própria flag e o próprio limiar.
 *
 * Qualquer fluxo com o Jev manda texto mascarado à TypeSafe (EUA): ligar só
 * depois do acesso antecipado confirmado e dos termos de privacidade (DPA).
 */

/** API pública da TypeSafe (docs.typesafe.ai/api, conferida em 15/10/2026). */
export const DEFAULT_JEV_BASE_URL = 'https://api.typesafe.ai';
export const DEFAULT_JEV_MODEL = 'jev-latest';
/** A TypeSafe anuncia 70–500 ms de ponta a ponta; o teto deixa folga para a rede até a Costa Oeste. */
export const DEFAULT_JEV_TIMEOUT_MS = 2000;
/**
 * Preço anunciado no acesso antecipado (CC-407): US$ 0,042 por milhão de
 * tokens de entrada. Só o gabarito usa (estimativa e freio de gasto);
 * conferir no contrato.
 */
export const JEV_USD_PER_MILLION_INPUT_TOKENS = 0.042;

export interface JevConnection {
  /** `null` sem `JEV_API_KEY`: nenhum fluxo do Jev roda. */
  apiKey: string | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

function readNumberSetting(
  config: ConfigService,
  key: string,
  fallback: number,
  isValid: (value: number) => boolean,
): number {
  const raw = config.get<string | number | undefined>(key);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && isValid(parsed) ? parsed : fallback;
}

function readText(config: ConfigService, key: string, fallback: string): string {
  const raw = config.get<string | undefined>(key)?.trim();
  return raw ? raw : fallback;
}

export function readJevConnection(config: ConfigService): JevConnection {
  const apiKey = config.get<string | undefined>('JEV_API_KEY')?.trim();
  return {
    apiKey: apiKey ? apiKey : null,
    baseUrl: readText(config, 'JEV_BASE_URL', DEFAULT_JEV_BASE_URL).replace(/\/+$/, ''),
    model: readText(config, 'JEV_MODEL', DEFAULT_JEV_MODEL),
    timeoutMs: readNumberSetting(
      config,
      'JEV_TIMEOUT_MS',
      DEFAULT_JEV_TIMEOUT_MS,
      (value) => Number.isInteger(value) && value >= 100 && value <= 10_000,
    ),
  };
}
