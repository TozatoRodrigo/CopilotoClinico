import { z } from 'zod';

export const consentScopes = ['ai_processing', 'data_sharing', 'analytics'] as const;

export const grantConsentSchema = z.object({
  scope: z.enum(consentScopes),
});

export type GrantConsentInput = z.infer<typeof grantConsentSchema>;
export type ConsentScope = GrantConsentInput['scope'];

export const requestErasureSchema = z.object({
  reason: z.string().optional(),
});

export type RequestErasureInput = z.infer<typeof requestErasureSchema>;
