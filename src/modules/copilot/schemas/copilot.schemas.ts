import { z } from 'zod';

export const analyzeSchema = z.object({
  caseText: z.string().min(10, 'Case text must be at least 10 characters'),
  context: z
    .object({
      hasCT: z.boolean().default(false),
      isSus: z.boolean().default(false),
      hasLab: z.boolean().default(false),
      hasICU: z.boolean().default(false),
    })
    .default({}),
  // F5 — marca o caso-norte / demo para segmentar o funil (LGPD-safe: tag opaca, sem conteúdo clínico).
  demoCase: z.string().trim().max(64).optional(),
});

export type AnalyzeInput = z.infer<typeof analyzeSchema>;

const boolParam = z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false);

export const streamQuerySchema = z.object({
  caseText: z.string().min(10, 'Case text must be at least 10 characters'),
  hasCT: boolParam,
  isSus: boolParam,
  hasLab: boolParam,
  hasICU: boolParam,
});

export type StreamQuery = z.infer<typeof streamQuerySchema>;

export const respondSchema = z.object({
  interactionId: z.string().uuid('interactionId must be a valid UUID'),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answer: z.union([z.string(), z.number(), z.boolean()]),
      }),
    )
    .min(1, 'At least one answer is required'),
});

export type RespondInput = z.infer<typeof respondSchema>;
