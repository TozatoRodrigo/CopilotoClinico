import { z } from 'zod';

export const resolveVerificationSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(1000).optional(),
});

export type ResolveVerificationInput = z.infer<typeof resolveVerificationSchema>;
