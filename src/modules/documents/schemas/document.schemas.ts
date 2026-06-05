import { z } from 'zod';

export const generateDocumentSchema = z.object({
  type: z.enum(['soap', 'sbar', 'prescricao', 'alta', 'atestado']),
  aiInteractionId: z.string().uuid(),
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;

export const editDocumentSchema = z.object({
  physicianEdits: z.record(z.unknown()),
});

export type EditDocumentInput = z.infer<typeof editDocumentSchema>;
