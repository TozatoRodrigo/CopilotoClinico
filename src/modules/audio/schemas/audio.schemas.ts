import { z } from 'zod';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
] as const;

export const uploadAudioSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_SIZE_BYTES, `Audio file must be ≤ ${MAX_SIZE_BYTES / 1024 / 1024} MB`),
  data: z.string().min(1), // base64-encoded audio
});

export type UploadAudioInput = z.infer<typeof uploadAudioSchema>;

export interface AudioUploadResponse {
  audioId: string;
  jobId: string;
  status: 'pending';
  message: string;
}

/**
 * S21-VOICE-02 — Schema para o endpoint síncrono de transcrição.
 *
 * Diferente do `uploadAudioSchema` (que cria AudioCapture + fila um job),
 * este endpoint retorna o texto transcrito imediatamente. Usado pela tela
 * de Captura para ditado rápido: grava → POST → recebe texto → insere no
 * Textarea. Sem persistir áudio (LGPD minimização), sem fila.
 *
 * O mesmo input shape (mime/size/data) é reutilizado para consistência.
 */
export const transcribeDirectSchema = uploadAudioSchema;

export type TranscribeDirectInput = z.infer<typeof transcribeDirectSchema>;

export interface TranscribeDirectResponse {
  /** Texto transcrito, já com máscara de PII aplicada (LGPD). */
  text: string;
  /** Modelo Whisper usado (para auditoria/reprodutibilidade). */
  model: string;
  /** SHA-256 do áudio (sem persistir o áudio em si — rastreabilidade CFM). */
  audioHash: string;
  /** Duração estimada do áudio em milissegundos. */
  durationMs: number;
}
