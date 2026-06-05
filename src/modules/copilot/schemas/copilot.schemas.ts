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
});

export type AnalyzeInput = z.infer<typeof analyzeSchema>;
