import { z } from 'zod';
import { FACILITY_TYPES, type PracticeSiteInput } from '../../../shared/contracts/practice-site';
import {
  practiceSiteNameSchema,
  referenceDistanceKmSchema,
  referenceTravelMinutesSchema,
  specialistsSchema,
} from '../../encounters/schemas/encounter-context.schema';

/**
 * CC-602 — corpo de POST e PUT `/physicians/me/practice-sites`. Estrito: o
 * formulário manda sempre o local inteiro, e campo desconhecido é erro (não
 * some em silêncio). Nenhum campo aceita dado de paciente.
 */
export const practiceSiteInputSchema = z
  .object({
    name: practiceSiteNameSchema,
    facilityType: z.enum(FACILITY_TYPES),
    hasCT: z.boolean(),
    hasLab: z.boolean(),
    hasICU: z.boolean(),
    isSus: z.boolean(),
    specialists: specialistsSchema,
    referenceTravelMinutes: referenceTravelMinutesSchema,
    referenceDistanceKm: referenceDistanceKmSchema,
    isDefault: z.boolean(),
  })
  .strict() satisfies z.ZodType<PracticeSiteInput, z.ZodTypeDef, unknown>;

export type PracticeSiteInputBody = z.output<typeof practiceSiteInputSchema>;
