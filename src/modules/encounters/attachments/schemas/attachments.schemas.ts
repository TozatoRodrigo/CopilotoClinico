import { z } from 'zod';
import { MAX_DOCUMENT_BYTES } from '../../../guidelines/ingestion/document-text';

/**
 * F4 — Referência anexada a um atendimento. Mesmo shape de upload do áudio
 * (mime/size/data em base64), para não inventar um segundo padrão de upload.
 */
export const createAttachmentSchema = z.object({
  filename: z.string().min(1).max(300),
  mimeType: z.enum(['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown'] as const),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_DOCUMENT_BYTES, `Arquivo deve ter no máximo ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`),
  /** Conteúdo do arquivo em base64. */
  data: z.string().min(1),
});

export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
