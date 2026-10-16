import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../config/feature-flag';

/**
 * CC-205 — modelos de transcrição que a API aceita. Só entra aqui modelo
 * medido pelo `pnpm eval:transcription` (docs/evals/transcricao.md), que lê a
 * mesma lista e exige preço para cada um.
 */
export const WHISPER_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'] as const;
export type WhisperModel = (typeof WHISPER_MODELS)[number];

/**
 * `WHISPER_MODEL`, lido a cada transcrição. Ausente, vazio ou fora da lista
 * cai no `whisper-large-v3`, o modelo de sempre: um typo nunca troca o
 * modelo em silêncio.
 */
export function readWhisperModel(config: ConfigService): WhisperModel {
  return readChoiceFlag(config, 'WHISPER_MODEL', WHISPER_MODELS, 'whisper-large-v3');
}
