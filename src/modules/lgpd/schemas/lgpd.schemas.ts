import { z } from 'zod';

export const consentScopes = ['ai_processing', 'data_sharing', 'analytics'] as const;

export const grantConsentSchema = z.object({
  scope: z.enum(consentScopes),
});

export type GrantConsentInput = z.infer<typeof grantConsentSchema>;
export type ConsentScope = GrantConsentInput['scope'];

/**
 * CC-010 — o que vale para um escopo sem nenhum registro. O processamento por
 * IA é o serviço em si: fica ativo desde o cadastro (que exige aceitar a
 * política de privacidade) até o médico revogar. Os outros começam
 * desligados. Ativo por padrão ou só com aceite explícito é decisão jurídica
 * pendente; trocar `ai_processing` para `false` bloqueia todo médico sem
 * registro até ele conceder.
 */
export const consentDefaults: Record<ConsentScope, boolean> = {
  ai_processing: true,
  data_sharing: false,
  analytics: false,
};

export const requestErasureSchema = z.object({
  reason: z.string().optional(),
});

export type RequestErasureInput = z.infer<typeof requestErasureSchema>;
