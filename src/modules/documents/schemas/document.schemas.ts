import { z } from 'zod';
import { documentTypeValues } from '../../../shared/contracts/clinical';

export const generateDocumentSchema = z.object({
  type: z.enum(documentTypeValues),
  aiInteractionId: z.string().uuid(),
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;

export const editDocumentSchema = z.object({
  physicianEdits: z.record(z.unknown()),
});

export type EditDocumentInput = z.infer<typeof editDocumentSchema>;
