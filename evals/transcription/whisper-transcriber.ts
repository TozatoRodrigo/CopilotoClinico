import { readFile } from 'node:fs/promises';
import { WhisperApiError, type WhisperService } from '../../src/modules/audio/whisper.service';
import { TranscriptionFailure, type FailureKind, type Transcriber } from './runner';

/**
 * CC-205 — o transcritor de verdade é o mesmo cliente da API
 * (src/modules/audio/whisper.service.ts): mesmo endpoint, mesmo `language`,
 * mesmo `response_format`. Só o modelo muda por chamada.
 */

export function failureKind(status: number): FailureKind {
  if (status === 429 || status === 402) return 'limit';
  if (status === 401 || status === 403) return 'auth';
  return 'other';
}

export function createWhisperTranscriber(whisper: Pick<WhisperService, 'transcribe'>): Transcriber {
  return {
    async transcribe(sample, model) {
      const audio = await readFile(sample.audioPath);
      try {
        // Sem `filename`: o id do ditado não vai para o provedor, como na tela de Captura.
        return await whisper.transcribe(audio, sample.mimeType, { model });
      } catch (error) {
        if (error instanceof WhisperApiError) {
          throw new TranscriptionFailure(failureKind(error.upstreamStatus), error.upstreamStatus);
        }
        throw error;
      }
    },
  };
}
