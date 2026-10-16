import { z } from 'zod';
import type {
  AgreeCrossReviewRequest,
  DivergeCrossReviewRequest,
  KnowledgeCardReviewQueueQuery,
  ReviewApproveKnowledgeCardRequest,
  ReviewRejectKnowledgeCardRequest,
} from '../../../shared/contracts/knowledge-card-review';
import {
  approveKnowledgeCardSchema,
  MAX_REVIEW_DURATION_MS,
  rejectKnowledgeCardSchema,
  REVIEW_TEXT_MAX_CHARS,
} from '../schemas/knowledge-cards.schemas';

/**
 * CC-404 — corpo e query da fila de revisão no celular. Mesmas regras do
 * console (`knowledge-cards.schemas.ts`), com o tempo de revisão obrigatório:
 * a tela cronometra cada cartão, e decisão sem tempo seria buraco na métrica.
 */

/** Mais que isso numa sessão não é "pular", é varrer a fila. */
export const MAX_SKIPPED_CARDS = 100;

const reviewDurationMs = z.number().int().min(0).max(MAX_REVIEW_DURATION_MS);

export const reviewQueueQuerySchema = z.object({
  skip: z
    .string()
    .max(MAX_SKIPPED_CARDS * 37)
    .optional()
    .transform((value) => (value ? value.split(',').filter((id) => id.length > 0) : []))
    .pipe(z.array(z.string().uuid()).max(MAX_SKIPPED_CARDS)),
}) satisfies z.ZodType<{ skip: string[] }, z.ZodTypeDef, KnowledgeCardReviewQueueQuery>;
export type ReviewQueueQueryInput = z.infer<typeof reviewQueueQuerySchema>;

export const reviewApproveSchema = approveKnowledgeCardSchema.extend({
  reviewDurationMs,
}) satisfies z.ZodType<ReviewApproveKnowledgeCardRequest, z.ZodTypeDef, unknown>;
export type ReviewApproveInput = z.infer<typeof reviewApproveSchema>;

export const reviewRejectSchema = rejectKnowledgeCardSchema.extend({
  reviewDurationMs,
}) satisfies z.ZodType<ReviewRejectKnowledgeCardRequest, z.ZodTypeDef, unknown>;
export type ReviewRejectInput = z.infer<typeof reviewRejectSchema>;

/** CC-411 — concordar com a versão sorteada; o comentário é opcional. */
export const agreeCrossReviewSchema = z
  .object({
    reviewDurationMs,
    comment: z.string().max(REVIEW_TEXT_MAX_CHARS).optional(),
  })
  .strict() satisfies z.ZodType<AgreeCrossReviewRequest, z.ZodTypeDef, unknown>;
export type AgreeCrossReviewInput = z.infer<typeof agreeCrossReviewSchema>;

/**
 * CC-411 — divergir é corrigir: motivo obrigatório e o conteúdo inteiro da
 * versão nova, que o serviço valida como a correção do console (formato e
 * checagem de citação, 422 com os problemas).
 */
export const divergeCrossReviewSchema = z
  .object({
    reason: z.string().trim().min(3).max(REVIEW_TEXT_MAX_CHARS),
    reviewDurationMs,
    basedOnVersion: z.number().int().min(1),
    content: z.unknown(),
  })
  .strict() satisfies z.ZodType<
  Omit<DivergeCrossReviewRequest, 'content'> & { content?: unknown },
  z.ZodTypeDef,
  unknown
>;
export type DivergeCrossReviewInput = z.infer<typeof divergeCrossReviewSchema>;
