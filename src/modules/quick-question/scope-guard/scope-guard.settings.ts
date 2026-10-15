import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';

/**
 * CC-503 — qual guarda de escopo decide a pergunta rápida, lida a cada
 * pergunta (sem redeploy). Valor ausente ou irreconhecível = `heuristic`.
 *
 * `jev` manda a pergunta mascarada à TypeSafe (EUA) e exige `JEV_API_KEY`;
 * sem a chave, ou com o Jev fora do ar, a heurística decide. Ligar só depois
 * do acesso antecipado confirmado e dos termos de privacidade (DPA).
 */
export const QUICK_QUESTION_SCOPE_GUARD_FLAG = 'QUICK_QUESTION_SCOPE_GUARD';
export const SCOPE_GUARD_KINDS = ['heuristic', 'jev'] as const;
export type ScopeGuardKind = (typeof SCOPE_GUARD_KINDS)[number];

export function readScopeGuardKind(config: ConfigService): ScopeGuardKind {
  return readChoiceFlag(config, QUICK_QUESTION_SCOPE_GUARD_FLAG, SCOPE_GUARD_KINDS, 'heuristic');
}

/** API pública da TypeSafe (docs.typesafe.ai/api, conferida em 15/10/2026). */
export const DEFAULT_JEV_BASE_URL = 'https://api.typesafe.ai';
export const DEFAULT_JEV_MODEL = 'jev-latest';
/** A TypeSafe anuncia 70–500 ms de ponta a ponta; o teto deixa folga para a rede até a Costa Oeste. */
export const DEFAULT_JEV_TIMEOUT_MS = 2000;
/**
 * Confiança mínima para o Jev recusar. Abaixo dela a pergunta segue: recusar
 * um médico com dúvida clínica custa mais que uma busca a mais. Provisório,
 * até calibrar com perguntas rotuladas pelos médicos.
 */
export const DEFAULT_JEV_SCOPE_MIN_CONFIDENCE = 0.6;

export interface JevSettings {
  /** `null` sem `JEV_API_KEY`: a guarda do Jev não roda. */
  apiKey: string | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  minConfidence: number;
}

function readNumber(
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

export function readJevSettings(config: ConfigService): JevSettings {
  const apiKey = config.get<string | undefined>('JEV_API_KEY')?.trim();
  return {
    apiKey: apiKey ? apiKey : null,
    baseUrl: readText(config, 'JEV_BASE_URL', DEFAULT_JEV_BASE_URL).replace(/\/+$/, ''),
    model: readText(config, 'JEV_MODEL', DEFAULT_JEV_MODEL),
    timeoutMs: readNumber(
      config,
      'JEV_TIMEOUT_MS',
      DEFAULT_JEV_TIMEOUT_MS,
      (value) => Number.isInteger(value) && value >= 100 && value <= 10_000,
    ),
    minConfidence: readNumber(
      config,
      'JEV_SCOPE_MIN_CONFIDENCE',
      DEFAULT_JEV_SCOPE_MIN_CONFIDENCE,
      (value) => value > 0 && value <= 1,
    ),
  };
}
