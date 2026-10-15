import { z } from 'zod';
import {
  QUICK_QUESTION_MAX_LENGTH,
  QUICK_QUESTION_MIN_LENGTH,
  type AskQuickQuestionRequest,
} from '../../shared/contracts/quick-question';

/** CC-501 — corpo do POST /quick-questions, conferido contra o contrato do web. */
export const askQuickQuestionSchema = z.object({
  question: z.string().trim().min(QUICK_QUESTION_MIN_LENGTH).max(QUICK_QUESTION_MAX_LENGTH),
}) satisfies z.ZodType<AskQuickQuestionRequest, z.ZodTypeDef, unknown>;

export type AskQuickQuestionInput = z.infer<typeof askQuickQuestionSchema>;
