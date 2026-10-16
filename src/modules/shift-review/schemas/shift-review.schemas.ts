import { z } from 'zod';
import {
  SHIFT_REVIEW_CONFIDENCES,
  type AnswerShiftReviewQuestionRequest,
} from '../../../shared/contracts/shift-review';

/** A alternativa escolhida (índice) e o quanto o médico sabia. */
export const answerShiftReviewQuestionSchema = z.object({
  chosenOption: z.number().int().min(0).max(9),
  confidence: z.enum(SHIFT_REVIEW_CONFIDENCES),
}) satisfies z.ZodType<AnswerShiftReviewQuestionRequest>;

export type AnswerShiftReviewQuestionInput = z.infer<typeof answerShiftReviewQuestionSchema>;
