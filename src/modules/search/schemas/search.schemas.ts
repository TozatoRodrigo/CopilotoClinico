import { z } from 'zod';
import {
  UNIFIED_SEARCH_DEFAULT_LIMIT,
  UNIFIED_SEARCH_MAX_CHARS,
  UNIFIED_SEARCH_MAX_LIMIT,
  UNIFIED_SEARCH_MIN_CHARS,
  type UnifiedSearchQuery,
} from '../../../shared/contracts/search';

/** CC-502 — query de `GET /search`, conferida contra o tipo do contrato. */
export const unifiedSearchQuerySchema = z.object({
  q: z.string().trim().min(UNIFIED_SEARCH_MIN_CHARS).max(UNIFIED_SEARCH_MAX_CHARS),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(UNIFIED_SEARCH_MAX_LIMIT)
    .default(UNIFIED_SEARCH_DEFAULT_LIMIT),
}) satisfies z.ZodType<UnifiedSearchQuery, z.ZodTypeDef, unknown>;
export type UnifiedSearchQueryInput = z.infer<typeof unifiedSearchQuerySchema>;
