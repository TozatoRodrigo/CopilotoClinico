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
