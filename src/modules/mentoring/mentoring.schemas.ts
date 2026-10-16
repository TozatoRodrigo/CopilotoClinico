import { z } from 'zod';
import {
  MENTOR_QUEUE_SCOPES,
  MENTORING_ANSWER_MAX_LENGTH,
  MENTORING_QUESTION_MAX_LENGTH,
  MENTORING_SATISFACTION_MAX,
  MENTORING_SATISFACTION_MIN,
} from '../../shared/contracts/clinical';
import type {
  AnswerMentoringRequest,
  CreateMentoringRequest,
  RateMentoringRequest,
} from '../../shared/contracts/clinical';

/**
 * CC-707 — validação dos corpos da mentoria. Os tipos inferidos têm de
 * coincidir com os do contrato (paridade no fim do arquivo): o web importa o
 * contrato, e um campo novo só aqui quebraria em silêncio.
 */

export const createMentoringRequestSchema = z.object({
  termsVersion: z.string().trim().min(1).max(64),
  // Literal: o pedido só existe depois do aviso "não é para urgência".
  acknowledgedNotUrgent: z.literal(true),
  question: z.string().max(MENTORING_QUESTION_MAX_LENGTH).optional(),
});
export type CreateMentoringRequestInput = z.infer<typeof createMentoringRequestSchema>;

export const rateMentoringRequestSchema = z.object({
  satisfaction: z.number().int().min(MENTORING_SATISFACTION_MIN).max(MENTORING_SATISFACTION_MAX),
});
export type RateMentoringRequestInput = z.infer<typeof rateMentoringRequestSchema>;

export const answerMentoringRequestSchema = z.object({
  answer: z.string().trim().min(1).max(MENTORING_ANSWER_MAX_LENGTH),
  termsVersion: z.string().trim().min(1).max(64),
});
export type AnswerMentoringRequestInput = z.infer<typeof answerMentoringRequestSchema>;

export const mentorQueueQuerySchema = z.object({
  scope: z.enum(MENTOR_QUEUE_SCOPES).default('open'),
});
export type MentorQueueQuery = z.infer<typeof mentorQueueQuerySchema>;

export const mentoringAdminQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type MentoringAdminQuery = z.infer<typeof mentoringAdminQuerySchema>;

// Paridade com o contrato: falha de compilação se os dois divergirem.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contractParity: [
  Exact<CreateMentoringRequestInput, CreateMentoringRequest>,
  Exact<RateMentoringRequestInput, RateMentoringRequest>,
  Exact<AnswerMentoringRequestInput, AnswerMentoringRequest>,
] = [true, true, true];
void contractParity;
