import { z } from 'zod';

export const startProtocolRunSchema = z.object({
  protocolId: z.string().uuid(),
});

export const answerProtocolRunSchema = z.object({
  answer: z.union([z.boolean(), z.number(), z.string()]),
});

export const abandonProtocolRunSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export type StartProtocolRunInput = z.infer<typeof startProtocolRunSchema>;
export type AnswerProtocolRunInput = z.infer<typeof answerProtocolRunSchema>;
export type AbandonProtocolRunInput = z.infer<typeof abandonProtocolRunSchema>;
