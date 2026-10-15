import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';
import { readJevConnection, type JevConnection } from '../../jev/jev.settings';

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

/**
 * Confiança mínima para o Jev recusar. Abaixo dela a pergunta segue: recusar
 * um médico com dúvida clínica custa mais que uma busca a mais. Provisório,
 * até calibrar com perguntas rotuladas pelos médicos.
 */
export const DEFAULT_JEV_SCOPE_MIN_CONFIDENCE = 0.6;

/** A conexão do Jev (`JEV_API_KEY`, `JEV_BASE_URL`…) mais o limiar da guarda. */
export interface JevSettings extends JevConnection {
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

export function readJevSettings(config: ConfigService): JevSettings {
  return {
    ...readJevConnection(config),
    minConfidence: readNumber(
      config,
      'JEV_SCOPE_MIN_CONFIDENCE',
      DEFAULT_JEV_SCOPE_MIN_CONFIDENCE,
      (value) => value > 0 && value <= 1,
    ),
  };
}
