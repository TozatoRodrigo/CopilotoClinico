import { z } from 'zod';
import { documentTypeValues } from '../../../shared/contracts/clinical';

export const generateDocumentSchema = z.object({
  type: z.enum(documentTypeValues),
  // RD-E7 — opcional: quando omitido, DocumentsService.generate() usa a
  // interação de IA mais recente do encontro (mesmo padrão de fallback já
  // usado em confirm()). Permite a tela Documento gerar/trocar de aba de
  // tipo sem o frontend precisar rastrear o aiInteractionId corrente.
  aiInteractionId: z.string().uuid().optional(),
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;

export const editDocumentSchema = z.object({
  physicianEdits: z.record(z.unknown()),
});

export type EditDocumentInput = z.infer<typeof editDocumentSchema>;
