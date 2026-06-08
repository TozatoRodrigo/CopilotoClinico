import { z } from 'zod';

export const ingestGuidelineSchema = z.object({
  text: z.string().min(10),
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  specialty: z.string().min(1),
  evidenceLevel: z.string().optional(),
});

export const deactivateGuidelineSchema = z.object({
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
});

export type IngestGuidelineBody = z.infer<typeof ingestGuidelineSchema>;
export type DeactivateGuidelineBody = z.infer<typeof deactivateGuidelineSchema>;
