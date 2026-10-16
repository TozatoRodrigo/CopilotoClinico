import { z } from 'zod';
import { PS_SYNDROMES } from '../../../shared/contracts/clinical';
import {
  KNOWLEDGE_CARD_DISPLAY_STATUSES,
  type ApproveKnowledgeCardRequest,
  type ArchiveKnowledgeCardRequest,
  type CreateKnowledgeCardDraftRequest,
  type CreateKnowledgeCardVersionRequest,
  type ListKnowledgeCardsQuery,
  type RejectKnowledgeCardRequest,
  type SubmitKnowledgeCardRequest,
} from '../../../shared/contracts/knowledge-cards';
import { MAX_SOURCES } from '../domain/card-content';
import { MAX_VALIDITY_MONTHS } from '../domain/card-lifecycle';

/**
 * CC-402/CC-403 — corpo e query dos endpoints de cartões. Cada schema é
 * conferido contra o tipo do contrato (`satisfies`): o web importa o tipo, a
 * API valida com o zod, e os dois não divergem em silêncio.
 */

/** Mesmo teto do comentário de feedback e da nota de triagem: nota clínica, não prontuário. */
const REVIEW_TEXT_MAX_CHARS = 2000;
/** Uma hora: acima disso a tela ficou aberta, não é tempo de revisão. */
const MAX_REVIEW_DURATION_MS = 60 * 60 * 1000;

const syndrome = z.enum(PS_SYNDROMES);
const version = z.number().int().min(1);
const reviewDurationMs = z.number().int().min(0).max(MAX_REVIEW_DURATION_MS).optional();

export const listKnowledgeCardsQuerySchema = z.object({
  displayStatus: z.enum(KNOWLEDGE_CARD_DISPLAY_STATUSES).optional(),
  syndrome: syndrome.optional(),
  institutionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}) satisfies z.ZodType<ListKnowledgeCardsQuery, z.ZodTypeDef, unknown>;
export type ListKnowledgeCardsQueryInput = z.infer<typeof listKnowledgeCardsQuerySchema>;

export const listKnowledgeCardDraftsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListKnowledgeCardDraftsQueryInput = z.infer<typeof listKnowledgeCardDraftsQuerySchema>;

export const createKnowledgeCardDraftSchema = z
  .object({
    topic: z.string().trim().min(3).max(200),
    syndrome: syndrome.optional(),
    institutionId: z.string().uuid().optional(),
    chunkIds: z.array(z.string().uuid()).min(1).max(MAX_SOURCES).optional(),
    submitForReview: z.boolean().default(true),
  })
  .strict() satisfies z.ZodType<CreateKnowledgeCardDraftRequest, z.ZodTypeDef, unknown>;
export type CreateKnowledgeCardDraftInput = z.infer<typeof createKnowledgeCardDraftSchema>;

/**
 * O conteúdo entra como `unknown` e o serviço o valida com
 * `KnowledgeCardContentInputSchema` (formato) e a checagem de citação, para
 * os dois tipos de problema voltarem juntos, com o caminho, num 422 que a
 * tela de revisão mostra no campo certo.
 */
export const createKnowledgeCardVersionSchema = z
  .object({
    basedOnVersion: version,
    content: z.unknown(),
  })
  .strict() satisfies z.ZodType<
  Omit<CreateKnowledgeCardVersionRequest, 'content'> & { content?: unknown },
  z.ZodTypeDef,
  unknown
>;
export type CreateKnowledgeCardVersionInput = z.infer<typeof createKnowledgeCardVersionSchema>;

export const submitKnowledgeCardSchema = z.object({ version }).strict() satisfies z.ZodType<
  SubmitKnowledgeCardRequest,
  z.ZodTypeDef,
  unknown
>;
export type SubmitKnowledgeCardInput = z.infer<typeof submitKnowledgeCardSchema>;

export const approveKnowledgeCardSchema = z
  .object({
    version,
    comment: z.string().max(REVIEW_TEXT_MAX_CHARS).optional(),
    validityMonths: z.number().int().min(1).max(MAX_VALIDITY_MONTHS).optional(),
    reviewDurationMs,
  })
  .strict() satisfies z.ZodType<ApproveKnowledgeCardRequest, z.ZodTypeDef, unknown>;
export type ApproveKnowledgeCardInput = z.infer<typeof approveKnowledgeCardSchema>;

export const rejectKnowledgeCardSchema = z
  .object({
    version,
    reason: z.string().trim().min(3).max(REVIEW_TEXT_MAX_CHARS),
    reviewDurationMs,
  })
  .strict() satisfies z.ZodType<RejectKnowledgeCardRequest, z.ZodTypeDef, unknown>;
export type RejectKnowledgeCardInput = z.infer<typeof rejectKnowledgeCardSchema>;

export const archiveKnowledgeCardSchema = z
  .object({ reason: z.string().trim().min(3).max(REVIEW_TEXT_MAX_CHARS) })
  .strict() satisfies z.ZodType<ArchiveKnowledgeCardRequest, z.ZodTypeDef, unknown>;
export type ArchiveKnowledgeCardInput = z.infer<typeof archiveKnowledgeCardSchema>;
