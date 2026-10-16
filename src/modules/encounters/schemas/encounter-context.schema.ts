import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { EncounterContext } from '../../../shared/contracts/clinical';
import {
  FACILITY_TYPES,
  PRACTICE_SITE_LIMITS,
  SITE_SPECIALISTS,
  type EncounterSite,
  type SiteSpecialist,
} from '../../../shared/contracts/practice-site';

/** Lista sem repetição, na ordem em que veio: a mesma especialidade marcada duas vezes conta uma. */
export const specialistsSchema = z
  .array(z.enum(SITE_SPECIALISTS))
  .max(SITE_SPECIALISTS.length)
  .transform((specialists): SiteSpecialist[] => [...new Set(specialists)]);

export const referenceTravelMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(PRACTICE_SITE_LIMITS.referenceTravelMinutesMax)
  .nullable();

export const referenceDistanceKmSchema = z
  .number()
  .int()
  .min(0)
  .max(PRACTICE_SITE_LIMITS.referenceDistanceKmMax)
  .nullable();

export const practiceSiteNameSchema = z
  .string()
  .trim()
  .min(2, 'Dê um nome ao local (ex.: "UPA Centro")')
  .max(PRACTICE_SITE_LIMITS.nameMaxChars);

/**
 * CC-602 — o local de plantão como ele entra no contexto do caso. Estrito:
 * um campo a mais no JSON seria ignorado em silêncio e poderia levar texto
 * livre para o prompt.
 */
export const encounterSiteSchema = z
  .object({
    siteId: z.string().uuid().nullable(),
    name: practiceSiteNameSchema,
    facilityType: z.enum(FACILITY_TYPES),
    specialists: specialistsSchema,
    referenceTravelMinutes: referenceTravelMinutesSchema,
    referenceDistanceKm: referenceDistanceKmSchema,
  })
  .strict() satisfies z.ZodType<EncounterSite, z.ZodTypeDef, unknown>;

/**
 * Contexto do caso na criação e na análise: recurso não marcado é `false`.
 * Mesma forma em POST /encounters, POST /copilot/analyze e na conversa do
 * Copiloto guiado.
 */
export const encounterContextSchema = z.object({
  hasCT: z.boolean().default(false),
  isSus: z.boolean().default(false),
  hasLab: z.boolean().default(false),
  hasICU: z.boolean().default(false),
  site: encounterSiteSchema.optional(),
}) satisfies z.ZodType<EncounterContext, z.ZodTypeDef, unknown>;

/** PATCH /encounters/:id: os quatro recursos explícitos, como antes; o local continua opcional. */
export const encounterContextUpdateSchema = z.object({
  hasCT: z.boolean(),
  isSus: z.boolean(),
  hasLab: z.boolean(),
  hasICU: z.boolean(),
  site: encounterSiteSchema.optional(),
}) satisfies z.ZodType<EncounterContext, z.ZodTypeDef, unknown>;

const EMPTY_CONTEXT: EncounterContext = {
  hasCT: false,
  isSus: false,
  hasLab: false,
  hasICU: false,
};

/**
 * Contexto gravado no banco (`encounters.context`, `case_intakes.context`):
 * o JSON volta sem tipo. Recurso que não é `true` vira `false`; local fora
 * do formato some (o caso segue como "sem local declarado"), nunca derruba
 * a análise.
 */
export function readStoredEncounterContext(value: Prisma.JsonValue | null): EncounterContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_CONTEXT };
  const site = encounterSiteSchema.safeParse(value.site);
  return {
    hasCT: value.hasCT === true,
    isSus: value.isSus === true,
    hasLab: value.hasLab === true,
    hasICU: value.hasICU === true,
    ...(site.success ? { site: site.data } : {}),
  };
}
