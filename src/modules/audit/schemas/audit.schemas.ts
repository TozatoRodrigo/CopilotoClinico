import { z } from 'zod';

export const auditQuerySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  from: z
    .string()
    .transform((v) => (v ? new Date(v) : undefined))
    .optional(),
  to: z
    .string()
    .transform((v) => (v ? new Date(v) : undefined))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
