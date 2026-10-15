import type { WhisperModel } from '../../src/modules/audio/whisper.settings';

/**
 * CC-205 — preço da Groq por hora de áudio (US$), o da história CC-205.
 * Conferir em groq.com/pricing antes de decidir: o relatório só é tão certo
 * quanto esta tabela. O `Record` obriga a ter preço para todo modelo que a
 * API aceita.
 */
export const WHISPER_USD_PER_HOUR: Record<WhisperModel, number> = {
  'whisper-large-v3': 0.111,
  'whisper-large-v3-turbo': 0.04,
};

/** A Groq cobra no mínimo 10 s por chamada: ditado curto custa mais por minuto. */
export const MIN_BILLED_SECONDS = 10;

export function billedCostUsd(model: WhisperModel, durationSec: number): number {
  return (Math.max(durationSec, MIN_BILLED_SECONDS) / 3600) * WHISPER_USD_PER_HOUR[model];
}

/** Custo de transcrever todos os áudios com todos os modelos, antes de chamar nada. */
export function plannedCostUsd(
  durationsSec: readonly number[],
  models: readonly WhisperModel[],
): number {
  return models.reduce(
    (total, model) =>
      total + durationsSec.reduce((sum, duration) => sum + billedCostUsd(model, duration), 0),
    0,
  );
}
