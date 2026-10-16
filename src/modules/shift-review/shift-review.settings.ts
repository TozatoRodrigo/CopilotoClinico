import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag, readChoiceFlag } from '../../config/feature-flag';
import { AI_EFFORTS, type AiEffort } from '../ai-gateway/providers/provider.interface';

/**
 * CC-801 — configuração da revisão do plantão, lida a cada chamada (liga e
 * desliga sem redeploy).
 */

/** Perguntas por revisão: o que o médico responde em 2 minutos depois do plantão. */
export const QUESTIONS_PER_REVIEW = 3;

/** As análises dos últimos 7 dias entram na revisão. */
export const REVIEW_WINDOW_DAYS = 7;

/** Teto de casos no prompt: bastam para 3 perguntas variadas e seguram o custo. */
export const MAX_REVIEW_ANALYSES = 6;

/** Teto de fontes por caso e no total do prompt. */
export const MAX_SOURCES_PER_ANALYSIS = 4;
export const MAX_REVIEW_SOURCES = 16;

/** Gerações por semana: falha de provedor tenta de novo ao abrir, sem gastar sem fim. */
export const MAX_GENERATION_ATTEMPTS = 3;

/**
 * Geração parada há mais que isto morreu com o processo (deploy, queda): a
 * revisão volta a poder ser gerada.
 */
export const STALE_GENERATION_MS = 5 * 60_000;

/** `COPILOT_SHIFT_REVIEW`: desligada por padrão; typo cai no padrão. */
export function readShiftReviewEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, 'COPILOT_SHIFT_REVIEW', false);
}

/** `AI_SHIFT_REVIEW_MODEL`; vazio = `undefined`, e o gateway usa o `AI_MODEL`. Aceita `perfil:modelo`. */
export function readShiftReviewModel(config: ConfigService): string | undefined {
  const configured = config.get<string | undefined>('AI_SHIFT_REVIEW_MODEL')?.trim();
  return configured ? configured : undefined;
}

/** `AI_SHIFT_REVIEW_EFFORT`, baixo por padrão: 3 perguntas curtas, sem pressa de plantão. */
export function readShiftReviewEffort(config: ConfigService): AiEffort {
  return readChoiceFlag(config, 'AI_SHIFT_REVIEW_EFFORT', AI_EFFORTS, 'low');
}
