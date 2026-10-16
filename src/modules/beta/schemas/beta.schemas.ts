import { z } from 'zod';
import {
  BETA_CITY_TYPES,
  BETA_FACILITY_TYPES,
  BETA_INVITE_LIMITS,
  BETA_TRAINING_VALUES,
  BRAZIL_UFS,
} from '../../../shared/contracts/beta';

/**
 * CC-702 — contratos de entrada do beta. Os tipos de saída e as listas de
 * valores vivem em src/shared/contracts/beta.ts; beta.schemas.spec.ts
 * confere que o que estes schemas aceitam é o tipo do contrato.
 */

/** Código como o médico digitou: a normalização (maiúsculas, sem hífen) é do serviço. */
export const inviteCodeInputSchema = z.string().trim().max(32);

export const betaProfileSchema = z.object({
  training: z.enum(BETA_TRAINING_VALUES),
  facilityType: z.enum(BETA_FACILITY_TYPES),
  uf: z.enum(BRAZIL_UFS),
  cityType: z.enum(BETA_CITY_TYPES),
});

export type BetaProfileInput = z.infer<typeof betaProfileSchema>;

export const registrationStatusQuerySchema = z.object({
  code: inviteCodeInputSchema.optional(),
});

export type RegistrationStatusQuery = z.infer<typeof registrationStatusQuerySchema>;

export const waitlistRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  // Consentimento explícito: o formulário só envia com a caixa marcada.
  contactConsent: z.literal(true),
  profile: betaProfileSchema.partial().optional(),
});

export type WaitlistRequestInput = z.infer<typeof waitlistRequestSchema>;

export const acceptTermsSchema = z.object({
  version: z.string().min(1).max(40),
});

export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>;

const batchLabelSchema = z
  .string()
  .trim()
  .min(1, 'Informe o lote ou a origem do convite')
  .max(BETA_INVITE_LIMITS.batchLabelMaxChars);

const validDaysSchema = z.coerce.number().int().min(1).max(BETA_INVITE_LIMITS.validDaysMax);

export const createInvitesSchema = z.object({
  batchLabel: batchLabelSchema,
  quantity: z.coerce.number().int().min(1).max(BETA_INVITE_LIMITS.quantityMax),
  maxUses: z.coerce.number().int().min(1).max(BETA_INVITE_LIMITS.maxUsesMax),
  validDays: validDaysSchema,
});

export type CreateInvitesInput = z.infer<typeof createInvitesSchema>;

export const approveWaitlistSchema = z.object({
  batchLabel: batchLabelSchema.optional(),
  validDays: validDaysSchema.optional(),
});

export type ApproveWaitlistInput = z.infer<typeof approveWaitlistSchema>;

export const waitlistQuerySchema = z.object({
  status: z.enum(['waiting', 'invited', 'registered']).optional(),
});

export type WaitlistQuery = z.infer<typeof waitlistQuerySchema>;

export const activationQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type ActivationQuery = z.infer<typeof activationQuerySchema>;
