import { z } from 'zod';

export const createInstitutionSchema = z.object({
  name: z.string().min(1),
  cnes: z.string().min(1).max(20).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const linkPhysicianSchema = z.object({
  physicianId: z.string().uuid(),
});

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type LinkPhysicianInput = z.infer<typeof linkPhysicianSchema>;
