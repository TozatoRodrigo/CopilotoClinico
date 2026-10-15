import { z } from 'zod';
import {
  KNOWLEDGE_GAP_DISMISS_REASON_MAX_CHARS,
  KNOWLEDGE_GAP_STATUSES,
  type DismissKnowledgeGapRequest,
  type DraftFromKnowledgeGapRequest,
  type KnowledgeGapQueueQuery,
} from '../../shared/contracts/knowledge-gaps';

/**
 * CC-409 — query e corpo da fila de lacunas, conferidos contra os tipos do
 * contrato (`satisfies`): o web importa o tipo, a API valida com o zod.
 */

export const knowledgeGapQueueQuerySchema = z.object({
  status: z.enum(KNOWLEDGE_GAP_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}) satisfies z.ZodType<KnowledgeGapQueueQuery, z.ZodTypeDef, unknown>;
export type KnowledgeGapQueueQueryInput = z.infer<typeof knowledgeGapQueueQuerySchema>;

/** Mesmos limites do tema no pedido de rascunho direto (`createKnowledgeCardDraftSchema`). */
export const draftFromKnowledgeGapSchema = z
  .object({
    topic: z.string().trim().min(3).max(200).optional(),
    submitForReview: z.boolean().default(true),
  })
  .strict() satisfies z.ZodType<DraftFromKnowledgeGapRequest, z.ZodTypeDef, unknown>;
export type DraftFromKnowledgeGapInput = z.infer<typeof draftFromKnowledgeGapSchema>;

export const dismissKnowledgeGapSchema = z
  .object({
    reason: z.string().trim().min(3).max(KNOWLEDGE_GAP_DISMISS_REASON_MAX_CHARS),
  })
  .strict() satisfies z.ZodType<DismissKnowledgeGapRequest, z.ZodTypeDef, unknown>;
export type DismissKnowledgeGapInput = z.infer<typeof dismissKnowledgeGapSchema>;

export const weeklyReportQuerySchema = z.object({
  /** Fim da janela de 7 dias; padrão agora. */
  endingAt: z.coerce.date().optional(),
});
export type WeeklyReportQueryInput = z.infer<typeof weeklyReportQuerySchema>;
