import { z } from 'zod';

export const createEncounterSchema = z.object({
  patientRef: z.string().min(1).max(50),
  vertical: z.string().min(1).default('trauma'),
  context: z
    .object({
      hasCT: z.boolean().default(false),
      isSus: z.boolean().default(false),
      hasLab: z.boolean().default(false),
      hasICU: z.boolean().default(false),
    })
    .default({}),
});

export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;

export const updateEncounterSchema = z.object({
  status: z.enum(['draft', 'in_review', 'finalized', 'cancelled']).optional(),
  context: z
    .object({
      hasCT: z.boolean(),
      isSus: z.boolean(),
      hasLab: z.boolean(),
      hasICU: z.boolean(),
    })
    .optional(),
});

export type UpdateEncounterInput = z.infer<typeof updateEncounterSchema>;
