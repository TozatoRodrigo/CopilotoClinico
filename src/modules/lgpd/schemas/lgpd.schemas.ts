import { z } from 'zod';

export const grantConsentSchema = z.object({
  scope: z.enum(['ai_processing', 'data_sharing', 'analytics']),
});

export type GrantConsentInput = z.infer<typeof grantConsentSchema>;

export const requestErasureSchema = z.object({
  reason: z.string().optional(),
});

export type RequestErasureInput = z.infer<typeof requestErasureSchema>;
