import { z } from 'zod';
import { LEGAL_DOCUMENT_TYPES } from '../../shared/contracts/legal';
import type {
  AcceptLegalDocumentsRequest,
  LegalDocumentSection,
  PublishLegalDocumentRequest,
} from '../../shared/contracts/legal';

/** Quantos documentos uma tela de aceite pode mandar de uma vez (hoje, 2). */
const MAX_DOCUMENTS_PER_ACCEPTANCE = 10;

export const acceptLegalDocumentsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(MAX_DOCUMENTS_PER_ACCEPTANCE),
}) satisfies z.ZodType<AcceptLegalDocumentsRequest>;

export type AcceptLegalDocumentsInput = z.infer<typeof acceptLegalDocumentsSchema>;

export const publishLegalDocumentSchema = z.object({
  type: z.enum(LEGAL_DOCUMENT_TYPES),
  version: z.string().trim().min(1).max(64),
}) satisfies z.ZodType<PublishLegalDocumentRequest>;

export type PublishLegalDocumentInput = z.infer<typeof publishLegalDocumentSchema>;

/**
 * `legal_documents.sections` é Json no Prisma: a leitura confere o formato
 * em vez de confiar num cast. Só a API escreve essa coluna, a partir do
 * catálogo; uma linha fora do formato é bug, não entrada do usuário.
 */
export const legalDocumentSectionsSchema = z.array(
  z.object({
    heading: z.string(),
    paragraphs: z.array(z.string()),
  }),
) satisfies z.ZodType<LegalDocumentSection[]>;
